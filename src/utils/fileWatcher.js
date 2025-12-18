/**
 * Real-time File Watcher for Sentinel
 * Provides continuous monitoring of code files with intelligent
 * debouncing and change detection for optimal performance
 */

import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import chalk from 'chalk';

export class FileWatcher extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Watch configuration
      debounceMs: 1000,        // Debounce time for file changes
      maxFiles: 1000,          // Maximum files to watch
      ignorePatterns: [
        'node_modules/**',
        'dist/**',
        'build/**',
        '.git/**',
        '*.min.js',
        '*.min.css',
        'vendor/**',
        '.sentinel-cache/**',
        'coverage/**',
        '.nyc_output/**'
      ],
      
      // File type filters
      watchExtensions: [
        '.js', '.ts', '.jsx', '.tsx',
        '.py', '.java', '.php', '.go', '.rs',
        '.cs', '.vb', '.cpp', '.c', '.h',
        '.rb', '.swift', '.kt', '.scala',
        '.yml', '.yaml', '.json', '.xml',
        '.sql', '.sh', '.bash', '.zsh'
      ],
      
      // Performance settings
      batchSize: 50,           // Process changes in batches
      checkInterval: 5000,     // Periodic full scan interval (ms)
      enablePeriodicScan: true,
      
      ...config
    };
    
    this.watchedFiles = new Map();
    this.watchedDirectories = new Set();
    this.changeQueue = new Set();
    this.isProcessing = false;
    this.startTime = null;
    this.stats = {
      filesWatched: 0,
      changesDetected: 0,
      analysesRun: 0,
      errors: 0
    };
  }

  /**
   * Start watching files and directories
   */
  async startWatching(targetPaths = ['.']) {
    console.log(chalk.cyan('👀 Starting Sentinel file watcher...'));
    this.startTime = Date.now();
    
    try {
      // Resolve and normalize target paths
      const resolvedPaths = targetPaths.map(p => path.resolve(p));
      
      // Scan and add files to watch
      await this.scanAndWatchPaths(resolvedPaths);
      
      // Start periodic scanning if enabled
      if (this.config.enablePeriodicScan) {
        this.startPeriodicScan();
      }
      
      console.log(chalk.green(`✅ Watching ${this.stats.filesWatched} files`));
      console.log(chalk.gray('Press Ctrl+C to stop watching\n'));
      
      // Start change processing loop
      this.processChangeQueue();
      
      return {
        success: true,
        filesWatched: this.stats.filesWatched,
        watchedDirectories: Array.from(this.watchedDirectories)
      };
    } catch (error) {
      console.error(chalk.red('Failed to start file watcher:'), error.message);
      throw error;
    }
  }

  /**
   * Scan and watch specific paths
   */
  async scanAndWatchPaths(paths) {
    for (const targetPath of paths) {
      try {
        const stats = await fs.promises.stat(targetPath);
        
        if (stats.isDirectory()) {
          await this.watchDirectory(targetPath);
        } else if (stats.isFile()) {
          await this.watchFile(targetPath);
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Cannot watch ${targetPath}: ${error.message}`));
      }
    }
  }

  /**
   * Watch a directory recursively
   */
  async watchDirectory(dirPath) {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        // Validate entry name to prevent path traversal
        if (entry.name.includes('..') || entry.name.includes('/') || entry.name.includes('\\')) {
          continue;
        }
        
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(process.cwd(), fullPath);
        
        // Check ignore patterns
        if (this.shouldIgnore(relativePath)) {
          continue;
        }
        
        // Check file extension
        if (entry.isFile() && !this.shouldWatchFile(relativePath)) {
          continue;
        }
        
        // Watch directory
        if (entry.isDirectory()) {
          this.watchedDirectories.add(fullPath);
          await this.watchDirectory(fullPath);
        }
        
        // Watch file
        if (entry.isFile()) {
          await this.watchFile(fullPath);
        }
      }
      
      // Setup directory watcher
      this.setupDirectoryWatcher(dirPath);
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Cannot watch directory ${dirPath}: ${error.message}`));
    }
  }

  /**
   * Watch a specific file
   */
  async watchFile(filePath) {
    try {
      if (this.watchedFiles.size >= this.config.maxFiles) {
        console.warn(chalk.yellow(`⚠️ Maximum files watched (${this.config.maxFiles})`));
        return;
      }
      
      const stats = await fs.promises.stat(filePath);
      const fileInfo = {
        path: filePath,
        size: stats.size,
        mtime: stats.mtime,
        watchedAt: Date.now()
      };
      
      this.watchedFiles.set(filePath, fileInfo);
      this.stats.filesWatched++;
      
      // Setup file watcher
      this.setupFileWatcher(filePath);
      
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Cannot watch file ${filePath}: ${error.message}`));
    }
  }

  /**
   * Setup file system watcher for a file
   */
  setupFileWatcher(filePath) {
    try {
      const watcher = fs.watch(filePath, {
        persistent: true,
        recursive: false
      }, (eventType, _filename) => {
        this.handleFileChange(filePath, eventType);
      });
      
      // Handle watcher errors
      watcher.on('error', (error) => {
        console.warn(chalk.yellow(`⚠️ Watcher error for ${filePath}: ${error.message}`));
        this.stats.errors++;
      });
      
      // Store watcher reference
      this.watchedFiles.get(filePath).watcher = watcher;
      
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Cannot setup watcher for ${filePath}: ${error.message}`));
    }
  }

  /**
   * Setup directory watcher for change detection
   */
  setupDirectoryWatcher(dirPath) {
    try {
      const watcher = fs.watch(dirPath, {
        persistent: true,
        recursive: true
      }, (eventType, filename) => {
        if (filename) {
          // Validate filename to prevent path traversal
          if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return;
          }
          
          const fullPath = path.resolve(dirPath, filename);
          
          // Validate path is within expected directory
          if (!fullPath.startsWith(path.resolve(dirPath))) {
            return;
          }
          
          const relativePath = path.relative(process.cwd(), fullPath);
          
          // Only process if it's a file we should watch
          if (this.shouldWatchFile(relativePath) && !this.shouldIgnore(relativePath)) {
            this.handleFileChange(fullPath, eventType);
          }
        }
      });
      
      watcher.on('error', (error) => {
        console.warn(chalk.yellow(`⚠️ Directory watcher error for ${dirPath}: ${error.message}`));
      });
      
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Cannot setup directory watcher for ${dirPath}: ${error.message}`));
    }
  }

  /**
   * Handle file change events
   */
  handleFileChange(filePath, eventType) {
    const now = Date.now();
    
    // Add to change queue with debouncing
    this.changeQueue.add(filePath);
    this.stats.changesDetected++;
    
    // Emit change event
    this.emit('fileChanged', {
      file: filePath,
      type: eventType,
      timestamp: now
    });
    
    // Log significant changes
    if (eventType === 'rename' || eventType === 'delete') {
      console.log(chalk.yellow(`📁 ${eventType}: ${path.relative(process.cwd(), filePath)}`));
    }
  }

  /**
   * Process change queue with debouncing
   */
  processChangeQueue() {
    if (this.isProcessing || this.changeQueue.size === 0) {
      return;
    }
    
    this.isProcessing = true;
    
    setTimeout(async () => {
      try {
        const changes = Array.from(this.changeQueue);
        this.changeQueue.clear();
        
        if (changes.length === 0) {
          this.isProcessing = false;
          return;
        }
        
        // Process changes in batches
        for (let i = 0; i < changes.length; i += this.config.batchSize) {
          const batch = changes.slice(i, i + this.config.batchSize);
          await this.processBatch(batch);
          
          // Small delay between batches to avoid overwhelming the system
          if (i + this.config.batchSize < changes.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
      } catch (error) {
        console.error(chalk.red('Error processing change queue:'), error.message);
        this.stats.errors++;
      } finally {
        this.isProcessing = false;
        
        // Continue processing if more changes queued
        if (this.changeQueue.size > 0) {
          setImmediate(() => this.processChangeQueue());
        }
      }
    }, this.config.debounceMs);
  }

  /**
   * Process a batch of file changes
   */
  async processBatch(filePaths) {
    const validFiles = [];
    
    // Validate and check file changes
    for (const filePath of filePaths) {
      try {
        // Check if file still exists
        const stats = await fs.promises.stat(filePath);
        const currentFileInfo = this.watchedFiles.get(filePath);
        
        // Add to analysis queue if file changed or is new
        if (!currentFileInfo || 
            stats.size !== currentFileInfo.size || 
            stats.mtime.getTime() !== currentFileInfo.mtime.getTime()) {
          
          validFiles.push(filePath);
          
          // Update file info
          this.watchedFiles.set(filePath, {
            size: stats.size,
            mtime: stats.mtime,
            watchedAt: currentFileInfo?.watchedAt || Date.now()
          });
        }
      } catch (error) {
        // File might have been deleted
        if (error.code === 'ENOENT') {
          this.watchedFiles.delete(filePath);
          console.log(chalk.red(`🗑️ Deleted: ${path.relative(process.cwd(), filePath)}`));
        }
      }
    }
    
    // Emit batch processed event if files changed
    if (validFiles.length > 0) {
      this.emit('batchProcessed', {
        files: validFiles,
        count: validFiles.length,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Start periodic full scan
   */
  startPeriodicScan() {
    setInterval(async () => {
      try {
        await this.performPeriodicScan();
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Periodic scan error: ${error.message}`));
      }
    }, this.config.checkInterval);
  }

  /**
   * Perform periodic scan to catch missed changes
   */
  async performPeriodicScan() {
    const changedFiles = [];
    
    // Check all watched files for changes
    for (const [filePath, fileInfo] of this.watchedFiles.entries()) {
      try {
        const stats = await fs.promises.stat(filePath);
        
        if (stats.size !== fileInfo.size || 
            stats.mtime.getTime() !== fileInfo.mtime.getTime()) {
          changedFiles.push(filePath);
          
          // Update file info
          this.watchedFiles.set(filePath, {
            ...fileInfo,
            size: stats.size,
            mtime: stats.mtime
          });
        }
      } catch (error) {
        // File might have been deleted
        if (error.code === 'ENOENT') {
          this.watchedFiles.delete(filePath);
        }
      }
    }
    
    if (changedFiles.length > 0) {
      console.log(chalk.cyan(`🔄 Periodic scan: ${changedFiles.length} files changed`));
      this.emit('periodicScanComplete', {
        changedFiles,
        count: changedFiles.length
      });
    }
  }

  /**
   * Check if file should be ignored
   */
  shouldIgnore(filePath) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    
    return this.config.ignorePatterns.some(pattern => {
      if (pattern.endsWith('/**')) {
        return normalizedPath.startsWith(pattern.slice(0, -3));
      }
      return normalizedPath.includes(pattern);
    });
  }

  /**
   * Check if file should be watched based on extension
   */
  shouldWatchFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return this.config.watchExtensions.includes(ext);
  }

  /**
   * Stop watching files
   */
  stopWatching() {
    console.log(chalk.yellow('\n🛑 Stopping file watcher...'));
    
    // Close all watchers
    for (const fileInfo of this.watchedFiles.values()) {
      if (fileInfo.watcher) {
        fileInfo.watcher.close();
      }
    }
    
    // Clear data
    this.watchedFiles.clear();
    this.watchedDirectories.clear();
    this.changeQueue.clear();
    
    // Calculate runtime
    const runtime = this.startTime ? Date.now() - this.startTime : 0;
    
    console.log(chalk.green('✅ File watcher stopped'));
    console.log(chalk.gray(`📊 Session stats:`));
    console.log(chalk.gray(`  Files watched: ${this.stats.filesWatched}`));
    console.log(chalk.gray(`  Changes detected: ${this.stats.changesDetected}`));
    console.log(chalk.gray(`  Analyses run: ${this.stats.analysesRun}`));
    console.log(chalk.gray(`  Runtime: ${Math.round(runtime / 1000)}s`));
    
    if (this.stats.errors > 0) {
      console.log(chalk.yellow(`  Errors: ${this.stats.errors}`));
    }
    
    return this.stats;
  }

  /**
   * Get current watching statistics
   */
  getStats() {
    return {
      ...this.stats,
      filesCurrentlyWatched: this.watchedFiles.size,
      directoriesWatched: this.watchedDirectories.size,
      queueSize: this.changeQueue.size,
      uptime: this.startTime ? Date.now() - this.startTime : 0
    };
  }

  /**
   * Add new files to watch dynamically
   */
  async addFilesToWatch(filePaths) {
    const addedFiles = [];
    
    for (const filePath of filePaths) {
      try {
        const stats = await fs.promises.stat(filePath);
        if (stats.isFile() && this.shouldWatchFile(filePath) && !this.shouldIgnore(filePath)) {
          await this.watchFile(filePath);
          addedFiles.push(filePath);
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Cannot add ${filePath}: ${error.message}`));
      }
    }
    
    if (addedFiles.length > 0) {
      console.log(chalk.green(`➕ Added ${addedFiles.length} files to watch`));
      this.emit('filesAdded', { files: addedFiles });
    }
    
    return addedFiles;
  }

  /**
   * Remove files from watching
   */
  removeFilesFromWatch(filePaths) {
    const removedFiles = [];
    
    for (const filePath of filePaths) {
      const fileInfo = this.watchedFiles.get(filePath);
      if (fileInfo) {
        if (fileInfo.watcher) {
          fileInfo.watcher.close();
        }
        this.watchedFiles.delete(filePath);
        removedFiles.push(filePath);
      }
    }
    
    if (removedFiles.length > 0) {
      console.log(chalk.yellow(`➖ Removed ${removedFiles.length} files from watch`));
      this.emit('filesRemoved', { files: removedFiles });
    }
    
    return removedFiles;
  }
}

export default FileWatcher;
