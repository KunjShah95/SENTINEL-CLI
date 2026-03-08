/**
 * Enhanced File Operations API
 * 
 * Replaces regex-based parsing with proper diff-based editing,
 * AST-aware refactoring, and batch operations.
 * 
 * Inspired by LSP's TextDocumentEdit protocol and modern code editors.
 */

import fs from 'fs';
import { promises as fsAsync } from 'fs';
import { promisify } from 'util';
import path from 'path';
import { glob as globAsync } from 'glob';
import { diffLines, createTwoFilesPatch } from 'diff';

const statAsync = promisify(fs.stat);
const chmodAsync = promisify(fs.chmod);
const symlinkAsync = promisify(fs.symlink);
const readlinkAsync = promisify(fs.readlink);
const realpathAsync = promisify(fs.realpath);

/**
 * Text document edit representing a change to a file.
 * Matches LSP TextDocumentEdit protocol.
 */
export class TextEdit {
  constructor(range, newText, oldString, newString) {
    // Support both signatures:
    // TextEdit(range, newText) - LSP style
    // TextEdit(null, null, oldString, newString) - pattern replacement style
    if (range === null && newText === null) {
      this.oldText = oldString;
      this.newText = newString;
      this.range = null;
    } else {
      this.range = range; // { startLine, startChar, endLine, endChar }
      this.newText = newText;
    }
  }

  static fromString(oldString, newString) {
    return new TextEdit(null, null, oldString, newString);
  }
}

/**
 * Range representing a position in text
 */
export class Range {
  constructor(startLine, startChar, endLine, endChar) {
    this.startLine = startLine;
    this.startChar = startChar;
    this.endLine = endLine;
    this.endChar = endChar;
  }

  static fromLineRange(startLine, endLine) {
    return new Range(startLine, 0, endLine, Infinity);
  }

  static fromString(content, substring) {
    const lines = content.split('\n');
    const subIndex = content.indexOf(substring);
    
    if (subIndex === -1) return null;

    let startLine = 0;
    let startChar = 0;
    let endLine = 0;
    let endChar = 0;
    let currentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineLength = lines[i].length + 1; // +1 for newline
      
      if (currentIndex <= subIndex && subIndex < currentIndex + lineLength) {
        startLine = i;
        startChar = subIndex - currentIndex;
      }

      const endIndex = subIndex + substring.length;
      if (currentIndex <= endIndex && endIndex <= currentIndex + lineLength) {
        endLine = i;
        endChar = endIndex - currentIndex;
      }

      currentIndex += lineLength;
    }

    return new Range(startLine, startChar, endLine, endChar);
  }
}

/**
 * File edit with change preview and validation
 */
export class FileEdit {
  constructor(filePath, edits = []) {
    this.filePath = filePath;
    this.edits = edits; // Array of TextEdit objects
    this.originalContent = null;
    this.modifiedContent = null;
    this.diff = null;
  }

  async load(content) {
    this.originalContent = content;
    return this;
  }

  applyEdits() {
    if (!this.originalContent) {
      throw new Error('Content not loaded. Call load() first.');
    }

    const lines = this.originalContent.split('\n');
    
    // Sort edits in reverse order to preserve line numbers
    const sortedEdits = [...this.edits].sort((a, b) => {
      if (a.range.endLine !== b.range.endLine) {
        return b.range.endLine - a.range.endLine;
      }
      return b.range.endChar - a.range.endChar;
    });

    let modified = this.originalContent;

    for (const edit of sortedEdits) {
      if (edit.oldString && edit.newString) {
        // String-based replacement
        if (!modified.includes(edit.oldString)) {
          throw new Error(`Old string not found: "${edit.oldString.substring(0, 50)}..."`);
        }
        modified = modified.replace(edit.oldString, edit.newString);
      } else if (edit.range) {
        // Range-based replacement
        const startOffset = this.lineCharToOffset(lines, edit.range.startLine, edit.range.startChar);
        const endOffset = this.lineCharToOffset(lines, edit.range.endLine, edit.range.endChar);
        modified = modified.substring(0, startOffset) + edit.newText + modified.substring(endOffset);
      }
    }

    this.modifiedContent = modified;
    this.diff = diffLines(this.originalContent, modified);
    return this;
  }

  lineCharToOffset(lines, line, char) {
    let offset = 0;
    for (let i = 0; i < line && i < lines.length; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }
    offset += char;
    return offset;
  }

  /**
   * Get unified diff for preview
   */
  getDiff() {
    if (!this.modifiedContent) throw new Error('Edits not applied');
    
    return createTwoFilesPatch(
      this.filePath,
      this.filePath,
      this.originalContent,
      this.modifiedContent,
      'original',
      'modified'
    );
  }

  /**
   * Get human-readable change summary
   */
  getSummary() {
    if (!this.diff) throw new Error('Edits not applied');

    let additions = 0;
    let deletions = 0;

    for (const part of this.diff) {
      if (part.added) additions += part.count || 0;
      if (part.removed) deletions += part.count || 0;
    }

    return {
      file: this.filePath,
      additions,
      deletions,
      modifications: Math.min(additions, deletions),
      totalLines: this.originalContent.split('\n').length,
      newLines: this.modifiedContent.split('\n').length
    };
  }
}

/**
 * Enhanced file operations with proper APIs
 */
export class EnhancedFileOperations {
  constructor(basePath = process.cwd()) {
    this.basePath = basePath;
    this.watcherMap = new Map();
  }

  resolvePath(filePath) {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.basePath, filePath);
  }

  // ============ BASIC OPERATIONS ============

  async read(filePath, options = {}) {
    const fullPath = this.resolvePath(filePath);
    try {
      const content = await fsAsync.readFile(fullPath, options.encoding || 'utf8');
      const stats = await statAsync(fullPath);
      
      return {
        success: true,
        content,
        path: fullPath,
        relativePath: path.relative(this.basePath, fullPath),
        size: stats.size,
        modified: stats.mtime,
        encoding: options.encoding || 'utf8'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: fullPath
      };
    }
  }

  async write(filePath, content, options = {}) {
    const fullPath = this.resolvePath(filePath);
    try {
      const dir = path.dirname(fullPath);
      await fsAsync.mkdir(dir, { recursive: true });
      await fsAsync.writeFile(fullPath, content, options.encoding || 'utf8');
      
      const stats = await statAsync(fullPath);
      
      return {
        success: true,
        path: fullPath,
        relativePath: path.relative(this.basePath, fullPath),
        size: stats.size,
        written: content.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: fullPath
      };
    }
  }

  // ============ DIFF-BASED EDITING ============

  /**
   * Apply text edits to a file with preview capability
   * Uses LSP-like protocol
   */
  async editWithDiff(filePath, edits, options = {}) {
    const fullPath = this.resolvePath(filePath);
    
    try {
      const { content } = await this.read(filePath);
      if (!content.success && !content.content) {
        return { success: false, error: 'Cannot read file' };
      }

      const fileEdit = new FileEdit(fullPath, edits);
      await fileEdit.load(content.content);
      fileEdit.applyEdits();

      // Preview mode - don't write
      if (options.preview) {
        return {
          success: true,
          preview: true,
          diff: fileEdit.getDiff(),
          summary: fileEdit.getSummary(),
          modified: fileEdit.modifiedContent
        };
      }

      // Apply changes
      await this.write(filePath, fileEdit.modifiedContent, options);

      return {
        success: true,
        path: fullPath,
        diff: fileEdit.getDiff(),
        summary: fileEdit.getSummary()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: fullPath
      };
    }
  }

  /**
   * Apply simple string replacement with diff preview
   */
  async replaceString(filePath, oldString, newString, options = {}) {
    const fullPath = this.resolvePath(filePath);
    
    try {
      const { content } = await this.read(filePath);
      if (!content.success) {
        return { success: false, error: 'Cannot read file' };
      }

      if (!content.content.includes(oldString)) {
        return {
          success: false,
          error: 'Old string not found in file',
          path: fullPath
        };
      }

      const newContent = content.content.replace(oldString, newString);

      if (options.preview) {
        return {
          success: true,
          preview: true,
          diff: createTwoFilesPatch(filePath, filePath, content.content, newContent),
          modifications: 1
        };
      }

      await this.write(filePath, newContent);

      return {
        success: true,
        path: fullPath,
        modifications: 1,
        diff: createTwoFilesPatch(filePath, filePath, content.content, newContent)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: fullPath
      };
    }
  }

  // ============ BATCH OPERATIONS ============

  /**
   * Apply same operation to multiple files
   */
  async batchEdit(filePattern, edits, options = {}) {
    const results = [];
    
    try {
      const files = await this.glob(filePattern);
      
      for (const file of files.files) {
        const result = await this.editWithDiff(file, edits, options);
        results.push({
          file,
          success: result.success,
          error: result.error,
          summary: result.summary
        });
      }

      return {
        success: true,
        filesProcessed: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        results
      };
    }
  }

  /**
   * Apply different edits to multiple files
   */
  async batchEditMultiple(edits, options = {}) {
    const results = [];
    
    for (const [filePath, fileEdits] of Object.entries(edits)) {
      const result = await this.editWithDiff(filePath, fileEdits, options);
      results.push({
        file: filePath,
        success: result.success,
        error: result.error
      });
    }

    return {
      success: true,
      filesProcessed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  // ============ PERMISSIONS & SYMLINKS ============

  async chmod(filePath, mode) {
    const fullPath = this.resolvePath(filePath);
    
    try {
      await chmodAsync(fullPath, mode);
      return {
        success: true,
        path: fullPath,
        mode: mode.toString(8)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: fullPath
      };
    }
  }

  async createSymlink(target, linkPath, type = 'file') {
    const fullTarget = this.resolvePath(target);
    const fullLink = this.resolvePath(linkPath);
    
    try {
      await symlinkAsync(fullTarget, fullLink, type);
      return {
        success: true,
        target: fullTarget,
        link: fullLink,
        type
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async readSymlink(linkPath) {
    const fullPath = this.resolvePath(linkPath);
    
    try {
      const target = await readlinkAsync(fullPath);
      const realPath = await realpathAsync(fullPath);
      
      return {
        success: true,
        link: fullPath,
        target,
        resolved: realPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        link: fullPath
      };
    }
  }

  // ============ FILE WATCHING ============

  async watch(filePath, callback, options = {}) {
    const fullPath = this.resolvePath(filePath);
    const watcher = fs.watch(fullPath, options, (eventType, changedPath) => {
      callback({
        event: eventType,
        file: changedPath,
        path: fullPath,
        timestamp: new Date()
      });
    });

    this.watcherMap.set(fullPath, watcher);

    return {
      success: true,
      watching: fullPath,
      unwatch: () => this.unwatch(fullPath)
    };
  }

  unwatch(filePath) {
    const fullPath = this.resolvePath(filePath);
    const watcher = this.watcherMap.get(fullPath);
    
    if (watcher) {
      watcher.close();
      this.watcherMap.delete(fullPath);
      return { success: true, unwatched: fullPath };
    }

    return { success: false, error: 'No watcher found' };
  }

  closeAllWatchers() {
    for (const watcher of this.watcherMap.values()) {
      watcher.close();
    }
    this.watcherMap.clear();
  }

  // ============ UTILITY OPERATIONS ============

  async exists(filePath) {
    const fullPath = this.resolvePath(filePath);
    try {
      await fsAsync.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async stat(filePath) {
    const fullPath = this.resolvePath(filePath);
    try {
      const stats = await statAsync(fullPath);
      return {
        success: true,
        path: fullPath,
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        isSymbolicLink: stats.isSymbolicLink(),
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        mode: stats.mode.toString(8)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: fullPath
      };
    }
  }

  async glob(pattern, options = {}) {
    try {
      const files = await globAsync(pattern, {
        cwd: this.basePath,
        ignore: options.ignore || ['node_modules/**', 'dist/**', '.git/**'],
        absolute: true,
        ...options
      });

      return {
        success: true,
        pattern,
        files,
        count: files.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        pattern,
        files: []
      };
    }
  }

  async delete(filePath) {
    const fullPath = this.resolvePath(filePath);
    try {
      const stats = await statAsync(fullPath);
      if (stats.isDirectory()) {
        await fsAsync.rm(fullPath, { recursive: true });
      } else {
        await fsAsync.unlink(fullPath);
      }
      return {
        success: true,
        path: fullPath,
        deleted: true
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: fullPath
      };
    }
  }

  async copy(source, destination, options = {}) {
    const srcPath = this.resolvePath(source);
    const destPath = this.resolvePath(destination);
    
    try {
      const dir = path.dirname(destPath);
      await fsAsync.mkdir(dir, { recursive: true });
      
      await fsAsync.cp(srcPath, destPath, { recursive: true, force: options.overwrite });
      
      return {
        success: true,
        source: srcPath,
        destination: destPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async move(source, destination) {
    const srcPath = this.resolvePath(source);
    const destPath = this.resolvePath(destination);
    
    try {
      const dir = path.dirname(destPath);
      await fsAsync.mkdir(dir, { recursive: true });
      await fsAsync.rename(srcPath, destPath);
      
      return {
        success: true,
        source: srcPath,
        destination: destPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async list(dirPath = '.') {
    const fullPath = this.resolvePath(dirPath);
    try {
      const entries = await fsAsync.readdir(fullPath);
      const items = [];
      
      for (const entry of entries) {
        const entryPath = path.join(fullPath, entry);
        const stats = await statAsync(entryPath);
        
        items.push({
          name: entry,
          path: entryPath,
          relativePath: path.relative(this.basePath, entryPath),
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
          size: stats.size,
          modified: stats.mtime
        });
      }

      items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return {
        success: true,
        path: fullPath,
        items,
        count: items.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: fullPath,
        items: []
      };
    }
  }
}

export default EnhancedFileOperations;
