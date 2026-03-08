import fs from 'fs';
import { promisify } from 'util';
import path from 'path';
import { glob as globAsync } from 'glob';
import { diffLines } from 'diff';

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const statAsync = promisify(fs.stat);
const readdirAsync = promisify(fs.readdir);
const mkdirAsync = promisify(fs.mkdir);
const unlinkAsync = promisify(fs.unlink);
const rmdirAsync = promisify(fs.rmdir);
const copyFileAsync = promisify(fs.copyFile);
const accessAsync = promisify(fs.access);

export class FileOperations {
  constructor(basePath = process.cwd()) {
    this.basePath = basePath;
  }

  // ===== NEW: Multi-file batch operations =====
  async batchEdit(files, changes, options = {}) {
    const dryRun = options.dryRun !== false;
    const results = [];

    for (const file of files) {
      const result = await this.edit(file, changes);
      results.push({
        file,
        ...result,
        applied: dryRun ? false : result.success
      });
    }

    return {
      total: files.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  async batchWrite(files, contents, options = {}) {
    const dryRun = options.dryRun !== false;
    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const content = Array.isArray(contents) ? contents[i] : contents;

      if (dryRun) {
        results.push({ file, success: true, dryRun: true });
      } else {
        const result = await this.write(file, content);
        results.push({ file, ...result });
      }
    }

    return {
      total: files.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  // ===== NEW: Find and replace across files =====
  async findAndReplace(pattern, replacement, options = {}) {
    const {
      glob = '**/*.{js,ts,jsx,tsx,py,go,rs}',
      ignore = ['node_modules/**', 'dist/**', '.git/**'],
      dryRun = false,
      useRegex = false,
      caseSensitive = true
    } = options;

    // Find all files matching pattern
    const searchResult = await this.glob(glob, { ignore });
    const files = searchResult.files;

    const results = [];

    for (const file of files) {
      const content = await this.read(file);
      if (!content.success) continue;

      const searchPattern = useRegex
        ? new RegExp(pattern, caseSensitive ? 'g' : 'gi')
        : pattern;

      const matches = content.content.match(searchPattern);
      if (!matches) continue;

      let newContent;
      if (useRegex) {
        newContent = content.content.replace(searchPattern, replacement);
      } else if (!caseSensitive) {
        // Case-insensitive replace
        const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        newContent = content.content.replace(regex, replacement);
      } else {
        newContent = content.content.split(pattern).join(replacement);
      }

      results.push({
        file,
        matches: matches.length,
        originalContent: content.content,
        newContent: dryRun ? newContent : null
      });

      if (!dryRun && newContent !== content.content) {
        await this.write(file, newContent);
      }
    }

    return {
      filesScanned: files.length,
      filesModified: results.length,
      totalMatches: results.reduce((sum, r) => sum + r.matches, 0),
      dryRun,
      results
    };
  }

  // ===== NEW: Rename/refactor across files =====
  async rename(symbol, newSymbol, options = {}) {
    // Find all occurrences of symbol and replace
    return await this.findAndReplace(symbol, newSymbol, {
      ...options,
      useRegex: true,
      glob: options.glob || '**/*.{js,ts,jsx,tsx,py,go,rs,java,cs}'
    });
  }

  // ===== NEW: Grep + Edit (find files with pattern, then edit) =====
  async grepEdit(pattern, changes, options = {}) {
    const {
      glob = '**/*.{js,ts,jsx,tsx,py,go,rs}',
      ignore = ['node_modules/**', 'dist/**', '.git/**']
    } = options;

    // First grep to find files
    const searchResult = await this.glob(glob, { ignore });
    const files = searchResult.files;

    const matchingFiles = [];
    for (const file of files) {
      const content = await this.read(file);
      if (!content.success) continue;

      if (content.content.includes(pattern)) {
        matchingFiles.push(file);
      }
    }

    // Then edit all matching files
    return await this.batchEdit(matchingFiles, changes, options);
  }

  // ===== NEW: Generate code from template =====
  async generateFromTemplate(template, variables, options = {}) {
    let content = template;

    // Simple variable replacement {{variable}}
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      content = content.replace(regex, value);
    }

    // Handle loops {{#each items}}...{{/each}}
    const eachRegex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
    let match;
    while ((match = eachRegex.exec(content)) !== null) {
      const [, arrayName, templateContent] = match;
      const items = variables[arrayName] || [];
      const rendered = items.map(item => {
        let itemContent = templateContent;
        for (const [key, value] of Object.entries(item)) {
          itemContent = itemContent.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
        }
        return itemContent;
      }).join('\n');
      content = content.replace(match[0], rendered);
    }

    const outputPath = options.outputPath;
    if (outputPath) {
      return await this.write(outputPath, content);
    }

    return { success: true, content };
  }

  // ===== NEW: Create from scaffolding template =====
  async scaffold(type, name, options = {}) {
    const templates = this.getTemplates();
    const template = templates[type];

    if (!template) {
      return { success: false, error: `Unknown template type: ${type}` };
    }

    const variables = {
      name,
      Name: name.charAt(0).toUpperCase() + name.slice(1),
      ...options.variables
    };

    return await this.generateFromTemplate(template, variables, options);
  }

  getTemplates() {
    return {
      component: `import React from 'react';

export const {{Name}} = ({ children }) => {
  return (
    <div className="{{name}}">
      {children}
    </div>
  );
};

export default {{Name}};`,
      hook: `import { useState, useEffect } from 'react';

export const use{{Name}} = (initialValue) => {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    // Add your effect logic here
  }, []);

  return [value, setValue];
};`,
      class: `class {{Name}} {
  constructor() {
    // Initialize your class
  }

  // Add your methods here
}

export default {{Name}};`,
      function: `export const {{name}} = () => {
  // Add your logic here
};

export default {{name}};`,
      test: `import { describe, it, expect } from 'vitest';
import { {{name}} } from './{{name}}';

describe('{{Name}}', () => {
  it('should work', () => {
    expect(true).toBe(true);
  });
});`,
      service: `class {{Name}}Service {
  constructor() {
    // Initialize service
  }

  async getData() {
    // Add your API call logic
    return [];
  }

  async postData(data) {
    // Add your POST logic
    return data;
  }
}

export default new {{Name}}Service();`
    };
  }

  resolvePath(filePath) {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.basePath, filePath);
  }

  async read(filePath, options = {}) {
    const fullPath = this.resolvePath(filePath);
    try {
      const content = await readFileAsync(fullPath, options.encoding || 'utf8');
      const stats = await statAsync(fullPath);
      return {
        success: true,
        content,
        path: fullPath,
        relativePath: path.relative(this.basePath, fullPath),
        size: stats.size,
        modified: stats.mtime,
        isBinary: options.encoding === 'binary' || !content.includes('\u0000') === false
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
      await this.ensureDir(dir);
      
      await writeFileAsync(fullPath, content, options.encoding || 'utf8');
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

  async edit(filePath, changes) {
    const fullPath = this.resolvePath(filePath);
    
    try {
      const original = await readFileAsync(fullPath, 'utf8');
      let modified = original;
      let changeCount = 0;

      for (const change of changes) {
        if (change.find) {
          if (change.replace !== undefined) {
            if (modified.includes(change.find)) {
              modified = modified.replace(change.find, change.replace);
              changeCount++;
            }
          } else if (change.remove) {
            if (modified.includes(change.find)) {
              modified = modified.split(change.find).join('');
              changeCount++;
            }
          }
        } else if (change.regex) {
          const regex = new RegExp(change.regex.pattern, change.regex.flags || 'g');
          const matches = modified.match(regex);
          if (matches) {
            if (change.replace !== undefined) {
              modified = modified.replace(regex, change.replace);
              changeCount += matches.length;
            } else if (change.remove) {
              modified = modified.replace(regex, '');
              changeCount += matches.length;
            }
          }
        }
      }

      await writeFileAsync(fullPath, modified, 'utf8');
      
      const diff = diffLines(original, modified);
      
      return {
        success: true,
        path: fullPath,
        changes: changeCount,
        diff,
        originalSize: original.length,
        newSize: modified.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: fullPath
      };
    }
  }

  async delete(filePath) {
    const fullPath = this.resolvePath(filePath);
    try {
      const stats = await statAsync(fullPath);
      if (stats.isDirectory()) {
        await rmdirAsync(fullPath, { recursive: true });
      } else {
        await unlinkAsync(fullPath);
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

  async copy(source, destination) {
    const srcPath = this.resolvePath(source);
    const destPath = this.resolvePath(destination);
    
    try {
      const dir = path.dirname(destPath);
      await this.ensureDir(dir);
      
      await copyFileAsync(srcPath, destPath);
      const stats = await statAsync(destPath);
      
      return {
        success: true,
        source: srcPath,
        destination: destPath,
        size: stats.size
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        source: srcPath,
        destination: destPath
      };
    }
  }

  async move(source, destination) {
    const result = await this.copy(source, destination);
    if (result.success) {
      await this.delete(source);
    }
    return result;
  }

  async exists(filePath) {
    const fullPath = this.resolvePath(filePath);
    try {
      await accessAsync(fullPath);
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
        accessed: stats.atime
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
    const fullPattern = path.isAbsolute(pattern) 
      ? pattern 
      : path.join(this.basePath, pattern);
    
    try {
      const files = await globAsync(fullPattern, {
        cwd: this.basePath,
        ignore: options.ignore || ['node_modules/**', 'dist/**', '.git/**', 'coverage/**'],
        absolute: options.absolute !== false,
        dot: options.dot || false,
        deep: options.deep !== undefined ? options.deep : -1
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

  async list(dirPath = '.', options = {}) {
    const fullPath = this.resolvePath(dirPath);
    try {
      const entries = await readdirAsync(fullPath);
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
      
      if (options.sort !== false) {
        items.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
      }
      
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

  async tree(dirPath = '.', options = {}) {
    const maxDepth = options.depth || 3;
    const result = [];
    
    const traverse = async (dir, depth = 0) => {
      if (depth > maxDepth) return;
      
      const items = await this.list(dir, { sort: true });
      for (const item of items.items) {
        result.push({
          path: item.relativePath,
          isDirectory: item.isDirectory,
          size: item.size,
          depth
        });
        
        if (item.isDirectory && depth < maxDepth) {
          await traverse(item.path, depth + 1);
        }
      }
    };
    
    await traverse(dirPath);
    
    return {
      success: true,
      path: this.resolvePath(dirPath),
      items: result,
      count: result.length
    };
  }

  async ensureDir(dirPath) {
    const fullPath = this.resolvePath(dirPath);
    try {
      await mkdirAsync(fullPath, { recursive: true });
      return { success: true, path: fullPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  setBasePath(basePath) {
    this.basePath = basePath;
  }

  getBasePath() {
    return this.basePath;
  }
}

export default FileOperations;
