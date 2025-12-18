import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import os from 'os';

/**
 * Handles incremental analysis with file-based caching
 * Only analyzes changed files and uses cached results for unchanged files
 */
export class IncrementalAnalyzer {
  constructor(cacheDir = '.sentinel/cache') {
    this.cacheDir = cacheDir;
    this.cacheFile = path.join(cacheDir, 'analysis-cache.json');
    this.cacheIndexFile = path.join(cacheDir, 'cache-index.json');
    this.cache = new Map();
    this.index = new Map();
    this.maxCacheSize = 1000; // Max files to cache
    this.workerPool = [];
    this.maxWorkers = Math.min(os.cpus().length, 4); // Limit to 4 workers
  }

  /**
   * Initialize cache directory and load existing cache
   */
  async initialize() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await this.loadCache();
      await this.loadIndex();
    } catch (error) {
      console.warn(`Cache initialization failed: ${error.message}`);
    }
  }

  /**
   * Load existing analysis cache
   */
  async loadCache() {
    try {
      const content = await fs.readFile(this.cacheFile, 'utf8');
      const data = JSON.parse(content);
      
      // Convert to Map for faster lookups
      this.cache = new Map(Object.entries(data));
      
      // Clean old entries if cache is too large
      if (this.cache.size > this.maxCacheSize) {
        await this.cleanOldEntries();
      }
    } catch (error) {
      // Cache doesn't exist or is corrupted
      this.cache = new Map();
    }
  }

  /**
   * Load cache index for metadata
   */
  async loadIndex() {
    try {
      const content = await fs.readFile(this.cacheIndexFile, 'utf8');
      const data = JSON.parse(content);
      this.index = new Map(Object.entries(data));
    } catch (error) {
      this.index = new Map();
    }
  }

  /**
   * Save cache to disk
   */
  async saveCache() {
    try {
      const cacheObj = Object.fromEntries(this.cache);
      const indexObj = Object.fromEntries(this.index);
      
      await Promise.all([
        fs.writeFile(this.cacheFile, JSON.stringify(cacheObj, null, 2)),
        fs.writeFile(this.cacheIndexFile, JSON.stringify(indexObj, null, 2)),
      ]);
    } catch (error) {
      console.warn(`Failed to save cache: ${error.message}`);
    }
  }

  /**
   * Generate hash for file content
   */
  generateFileHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check if file has changed since last analysis
   */
  async hasFileChanged(filePath, content) {
    const currentHash = this.generateFileHash(content);
    const cachedData = this.index.get(filePath);
    
    if (!cachedData) {
      return true; // File not analyzed before
    }
    
    return cachedData.hash !== currentHash;
  }

  /**
   * Get cached analysis for a file
   */
  getCachedAnalysis(filePath) {
    const cachedData = this.index.get(filePath);
    if (!cachedData) {
      return null;
    }
    
    const analysis = this.cache.get(cachedData.cacheKey);
    if (!analysis) {
      return null;
    }
    
    return {
      ...analysis,
      fromCache: true,
      cachedAt: cachedData.analyzedAt,
    };
  }

  /**
   * Cache analysis results for a file
   */
  async cacheAnalysis(filePath, content, analysis) {
    const hash = this.generateFileHash(content);
    const cacheKey = `${filePath}_${hash}`;
    const now = new Date().toISOString();
    
    // Store in cache
    this.cache.set(cacheKey, {
      ...analysis,
      cachedAt: now,
      fileHash: hash,
    });
    
    // Update index
    this.index.set(filePath, {
      hash,
      cacheKey,
      analyzedAt: now,
      fileSize: content.length,
      issuesCount: analysis.issues?.length || 0,
    });
    
    // Clean up if needed
    if (this.cache.size > this.maxCacheSize) {
      await this.cleanOldEntries();
    }
  }

  /**
   * Clean old cache entries
   */
  async cleanOldEntries() {
    const entries = Array.from(this.index.entries());
    
    // Sort by last analyzed time (oldest first)
    entries.sort((a, b) => new Date(a[1].analyzedAt) - new Date(b[1].analyzedAt));
    
    // Remove oldest 25% of entries
    const toRemove = Math.floor(entries.length * 0.25);
    
    for (let i = 0; i < toRemove; i++) {
      const [filePath, data] = entries[i];
      this.cache.delete(data.cacheKey);
      this.index.delete(filePath);
    }
  }

  /**
   * Filter files that need analysis
   */
  async filterFilesToAnalyze(files) {
    const filesToAnalyze = [];
    const cachedResults = [];
    
    for (const fileData of files) {
      const hasChanged = await this.hasFileChanged(fileData.path, fileData.content);
      
      if (hasChanged) {
        filesToAnalyze.push(fileData);
      } else {
        const cached = this.getCachedAnalysis(fileData.path);
        if (cached) {
          cachedResults.push({
            ...fileData,
            cachedAnalysis: cached,
          });
        } else {
          // Cache miss, need to analyze
          filesToAnalyze.push(fileData);
        }
      }
    }
    
    return {
      filesToAnalyze,
      cachedResults,
      totalFiles: files.length,
      fromCache: cachedResults.length,
      needAnalysis: filesToAnalyze.length,
    };
  }

  /**
   * Validate worker message for origin and authenticity
   */
  validateWorkerMessage(message, expectedSessionToken, expectedWorkerId) {
    // Check if message has the required structure
    if (!message || typeof message !== 'object') {
      return false;
    }
    
    // Validate session token
    if (message.sessionToken !== expectedSessionToken) {
      console.warn('Invalid session token in worker message');
      return false;
    }
    
    // Validate worker ID
    if (message.workerId !== expectedWorkerId) {
      console.warn('Invalid worker ID in worker message');
      return false;
    }
    
    // Check for error in message
    if (message.error) {
      console.warn(`Worker reported error: ${message.error}`);
      return false;
    }
    
    // Validate data structure
    if (!message.data || !Array.isArray(message.data)) {
      console.warn('Invalid data structure in worker message');
      return false;
    }
    
    return true;
  }

  /**
   * Analyze files in parallel using worker threads
   */
  async analyzeFilesInParallel(files, analyzerFunction, options = {}) {
    if (!isMainThread) {
      throw new Error('Parallel analysis must be run from main thread');
    }
    
    if (files.length === 0) {
      return [];
    }
    
    const { maxWorkers = this.maxWorkers, chunkSize = 1 } = options;
    const chunks = this.chunkArray(files, chunkSize);
    
    // Generate a unique session token for this analysis batch
    const sessionToken = crypto.randomBytes(32).toString('hex');
    
    // Create worker pool
    const workers = [];
    const promises = [];
    
    for (let i = 0; i < Math.min(maxWorkers, chunks.length); i++) {
      const workerDataChunks = chunks.filter((_, index) => index % maxWorkers === i);
      
      const worker = new Worker(__filename, {
        workerData: {
          analyzerFunction: analyzerFunction.toString(),
          chunks: workerDataChunks,
          sessionToken,
          workerId: i,
        },
      });
      
      workers.push(worker);
      
      const promise = new Promise((resolve, reject) => {
        const messageHandler = (message) => {
          // Validate message origin and authenticity
          if (!this.validateWorkerMessage(message, sessionToken, i)) {
            reject(new Error('Invalid worker message: failed origin validation'));
            return;
          }
          
          // Remove the listener after successful validation
          worker.off('message', messageHandler);
          clearTimeout(timeout); // Clear timeout when message is received
          resolve(message.data);
        };
        
        worker.on('message', messageHandler);
        worker.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        worker.on('exit', (code) => {
          clearTimeout(timeout);
          if (code !== 0) {
            reject(new Error(`Worker stopped with exit code ${code}`));
          }
        });
        
        // Set timeout to prevent hanging
        const timeout = setTimeout(() => {
          worker.off('message', messageHandler);
          worker.terminate();
          reject(new Error(`Worker ${i} timed out`));
        }, 300000); // 5 minutes timeout
      });
      
      promises.push(promise);
    }
    
    try {
      const results = await Promise.all(promises);
      return results.flat();
    } finally {
      // Clean up workers
      workers.forEach(worker => {
        try {
          worker.terminate();
        } catch (error) {
          console.warn('Failed to terminate worker:', error.message);
        }
      });
    }
  }

  /**
   * Split array into chunks
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Run incremental analysis
   */
  async runIncrementalAnalysis(files, analyzers, options = {}) {
    const startTime = Date.now();
    
    // Filter files that need analysis
    const filterResult = await this.filterFilesToAnalyze(files);
    
    console.log(`📊 Incremental Analysis:`);
    console.log(`  Total files: ${filterResult.totalFiles}`);
    console.log(`  From cache: ${filterResult.fromCache}`);
    console.log(`  Need analysis: ${filterResult.needAnalysis}`);
    
    // Collect all results
    const allResults = [];
    
    // Add cached results
    for (const cached of filterResult.cachedResults) {
      allResults.push(cached.cachedAnalysis);
    }
    
    // Analyze files that need it
    if (filterResult.filesToAnalyze.length > 0) {
      let analysisResults;
      
      if (options.parallel && filterResult.filesToAnalyze.length > 1) {
        // Parallel analysis
        analysisResults = await this.analyzeFilesInParallel(
          filterResult.filesToAnalyze,
          (files) => this.analyzeFilesSequentially(files, analyzers),
          options
        );
      } else {
        // Sequential analysis
        analysisResults = await this.analyzeFilesSequentially(
          filterResult.filesToAnalyze,
          analyzers
        );
      }
      
      // Cache the new results
      for (let i = 0; i < filterResult.filesToAnalyze.length; i++) {
        const fileData = filterResult.filesToAnalyze[i];
        const result = analysisResults[i];
        
        if (result && !result.fromCache) {
          await this.cacheAnalysis(fileData.path, fileData.content, result);
        }
        
        allResults.push(result);
      }
    }
    
    // Save cache
    await this.saveCache();
    
    const duration = Date.now() - startTime;
    
    return {
      results: allResults,
      summary: {
        totalFiles: filterResult.totalFiles,
        cachedFiles: filterResult.fromCache,
        analyzedFiles: filterResult.needAnalysis,
        duration: `${duration}ms`,
        cacheHitRate: `${((filterResult.fromCache / filterResult.totalFiles) * 100).toFixed(1)}%`,
      },
    };
  }

  /**
   * Analyze files sequentially (used by workers)
   */
  async analyzeFilesSequentially(files, analyzers) {
    const results = [];
    
    for (const fileData of files) {
      const fileResults = [];
      
      for (const AnalyzerClass of analyzers) {
        try {
          const analyzer = new AnalyzerClass();
          const issues = await analyzer.analyzeFile(fileData.path, fileData.content);
          
          fileResults.push({
            analyzer: analyzer.getName(),
            issues,
            stats: analyzer.getStats(),
          });
        } catch (error) {
          console.warn(`Analyzer ${AnalyzerClass.name} failed for ${fileData.path}: ${error.message}`);
        }
      }
      
      results.push({
        file: fileData.path,
        analyzers: fileResults,
        totalIssues: fileResults.reduce((sum, r) => sum + (r.issues?.length || 0), 0),
      });
    }
    
    return results;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const stats = {
      cacheSize: this.cache.size,
      indexSize: this.index.size,
      maxCacheSize: this.maxCacheSize,
      utilizationRate: `${((this.cache.size / this.maxCacheSize) * 100).toFixed(1)}%`,
    };
    
    // Calculate cache age statistics
    if (this.index.size > 0) {
      const ages = Array.from(this.index.values()).map(entry => {
        return Date.now() - new Date(entry.analyzedAt).getTime();
      });
      
      stats.oldestEntry = `${Math.max(...ages) / (1000 * 60 * 60)}h`;
      stats.newestEntry = `${Math.min(...ages) / (1000 * 60 * 60)}h`;
      stats.averageAge = `${(ages.reduce((a, b) => a + b, 0) / ages.length) / (1000 * 60 * 60)}h`;
    }
    
    return stats;
  }

  /**
   * Clear cache
   */
  async clearCache() {
    this.cache.clear();
    this.index.clear();
    
    try {
      await Promise.all([
        fs.unlink(this.cacheFile),
        fs.unlink(this.cacheIndexFile),
      ]);
    } catch (error) {
      // Files might not exist
    }
  }

  /**
   * Export cache for debugging
   */
  async exportCache(outputPath) {
    const exportData = {
      timestamp: new Date().toISOString(),
      stats: this.getCacheStats(),
      cache: Object.fromEntries(this.cache),
      index: Object.fromEntries(this.index),
    };
    
    const path = outputPath || path.join(this.cacheDir, `cache-export-${Date.now()}.json`);
    await fs.writeFile(path, JSON.stringify(exportData, null, 2));
    
    return path;
  }
}

// Worker thread execution
if (!isMainThread) {
  const { analyzerFunction: analyzerFuncStr, chunks, sessionToken, workerId } = workerData;
  
  // Validate worker data
  if (!analyzerFuncStr || !chunks || !sessionToken || workerId === undefined) {
    parentPort.postMessage({ 
      error: 'Invalid worker data: missing required fields',
      sessionToken,
      workerId 
    });
    process.exit(1);
  }
  
  // Recreate the analyzer function
  const analyzerFunction = new Function('return ' + analyzerFuncStr)();
  
  (async () => {
    try {
      const results = await analyzerFunction(chunks);
      
      // Send validated message with session token and worker ID
      parentPort.postMessage({
        sessionToken,
        workerId,
        data: results,
        timestamp: Date.now()
      });
    } catch (error) {
      parentPort.postMessage({ 
        error: error.message,
        sessionToken,
        workerId
      });
    }
  })();
}

export default IncrementalAnalyzer;
