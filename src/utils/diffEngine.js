import { diffLines, diffChars, diffWords, createPatch } from 'diff';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * DiffEngine - Provides safe diff-based editing with preview capabilities
 */
export class DiffEngine {
  constructor(options = {}) {
    this.contextLines = options.contextLines || 3;
    this.format = options.format || 'unified'; // unified, side-by-side, json
  }

  /**
   * Compare two strings and return differences
   */
  compare(oldContent, newContent, options = {}) {
    const method = options.method || 'lines';
    
    let diff;
    switch (method) {
      case 'chars':
        diff = diffChars(oldContent, newContent);
        break;
      case 'words':
        diff = diffWords(oldContent, newContent);
        break;
      case 'lines':
      default:
        diff = diffLines(oldContent, newContent);
        break;
    }
    
    return {
      changes: diff.map(part => ({
        value: part.value,
        added: part.added || false,
        removed: part.removed || false,
        count: part.count || part.value.split('\n').length
      })),
      additions: diff.filter(p => p.added).reduce((sum, p) => sum + (p.count || p.value.split('\n').length), 0),
      deletions: diff.filter(p => p.removed).reduce((sum, p) => sum + (p.count || p.value.split('\n').length), 0)
    };
  }

  /**
   * Create unified diff format
   */
  createUnifiedDiff(oldContent, newContent, options = {}) {
    const {
      oldPath = 'original',
      header = ''
    } = options;

    const patch = createPatch(oldPath, oldContent, newContent, '', '', {
      context: this.contextLines
    });

    return header ? `${header}\n${patch}` : patch;
  }

  /**
   * Preview changes without applying
   */
  async preview(filePath, newContent, options = {}) {
    let oldContent;
    
    try {
      oldContent = await fs.readFile(filePath, 'utf-8');
    } catch {
      // File doesn't exist - treat as new file
      oldContent = '';
    }

    const comparison = this.compare(oldContent, newContent, options);
    const unifiedDiff = this.createUnifiedDiff(oldContent, newContent, {
      oldPath: filePath,
      newPath: filePath,
      ...options
    });

    return {
      filePath,
      isNewFile: !oldContent,
      comparison,
      unifiedDiff,
      stats: {
        additions: comparison.additions,
        deletions: comparison.deletions,
        changes: comparison.changes.length
      }
    };
  }

  /**
   * Apply changes with backup
   */
  async apply(filePath, newContent, options = {}) {
    const { createBackup = true, backupDir = '.sentinel/backups' } = options;
    
    let oldContent;
    let backupPath;

    try {
      oldContent = await fs.readFile(filePath, 'utf-8');
      
      // Create backup
      if (createBackup) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = path.basename(filePath);
        backupPath = path.join(backupDir, `${fileName}.${timestamp}.bak`);
        
        await fs.mkdir(backupDir, { recursive: true });
        await fs.writeFile(backupPath, oldContent, 'utf-8');
      }
    } catch {
      // New file - no backup needed
      oldContent = '';
    }

    // Write new content
    await fs.writeFile(filePath, newContent, 'utf-8');

    const comparison = this.compare(oldContent, newContent);

    return {
      success: true,
      filePath,
      backupPath,
      stats: {
        additions: comparison.additions,
        deletions: comparison.deletions
      }
    };
  }

  /**
   * Apply specific line-based edits
   */
  async applyEdits(filePath, edits, options = {}) {
    const { createBackup = true } = options;
    
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const editsSorted = [...edits].sort((a, b) => b.line - a.line);

    if (createBackup) {
      const backupDir = '.sentinel/backups';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      await fs.mkdir(backupDir, { recursive: true });
      await fs.writeFile(
        path.join(backupDir, `${path.basename(filePath)}.${timestamp}.bak`),
        content,
        'utf-8'
      );
    }

    for (const edit of editsSorted) {
      const { line, endLine, content: newContent } = edit;
      
      if (endLine) {
        // Replace range
        lines.splice(line - 1, endLine - line + 1, newContent);
      } else {
        // Single line replacement
        lines[line - 1] = newContent;
      }
    }

    const newContent = lines.join('\n');
    await fs.writeFile(filePath, newContent, 'utf-8');

    return {
      success: true,
      filePath,
      editsApplied: edits.length
    };
  }

  /**
   * Generate side-by-side diff view
   */
  generateSideBySide(oldContent, newContent, _options = {}) {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    const comparison = this.compare(oldContent, newContent);
    
    const left = [];
    const right = [];
    
    let oldIdx = 0;
    let newIdx = 0;

    for (const change of comparison.changes) {
      if (change.removed) {
        left.push({ content: oldLines[oldIdx], type: 'removed' });
        right.push({ content: '', type: 'empty' });
        oldIdx++;
      } else if (change.added) {
        left.push({ content: '', type: 'empty' });
        right.push({ content: newLines[newIdx], type: 'added' });
        newIdx++;
      } else {
        left.push({ content: oldLines[oldIdx], type: 'unchanged' });
        right.push({ content: newLines[newIdx], type: 'unchanged' });
        oldIdx++;
        newIdx++;
      }
    }

    return { left, right, stats: comparison };
  }

  /**
   * Check if file has unstaged changes
   */
  async hasUnstagedChanges(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return { hasChanges: false, content }; // Simplified - real implementation would check git
    } catch {
      return { hasChanges: true, content: '' };
    }
  }

  /**
   * Revert to backup
   */
  async revertFromBackup(backupPath, targetPath) {
    const backupContent = await fs.readFile(backupPath, 'utf-8');
    await fs.writeFile(targetPath, backupContent, 'utf-8');
    
    return { success: true, revertedTo: backupPath };
  }
}

export default DiffEngine;
