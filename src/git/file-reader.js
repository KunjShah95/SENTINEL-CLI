import { promises as fs } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

export class FileReader {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.gitTimeout = options.gitTimeout || 30_000;
    this.maxLines = options.maxLines || 10_000;
  }

  async read(filePath, ref = null) {
    const resolved = path.resolve(this.cwd, filePath);
    if (ref) {
      return this._readFromGit(filePath, ref);
    }
    return await fs.readFile(resolved, 'utf-8');
  }

  async readLines(filePath, startLine, endLine, ref = null) {
    const content = await this.read(filePath, ref);
    const lines = content.split('\n');
    const start = Math.max(0, startLine - 1);
    const end = Math.min(lines.length, endLine || start + 500);
    return lines.slice(start, end).join('\n');
  }

  async readWindow(filePath, targetLine, contextLines = 3, ref = null) {
    const content = await this.read(filePath, ref);
    const lines = content.split('\n');
    const start = Math.max(0, targetLine - 1 - contextLines);
    const end = Math.min(lines.length, targetLine + contextLines);
    return {
      content: lines.slice(start, end).join('\n'),
      startLine: start + 1,
      endLine: end,
      totalLines: lines.length,
      truncated: lines.length > this.maxLines,
    };
  }

  async exists(filePath, ref = null) {
    if (ref) {
      try {
        execSync(`git show ${ref}:${filePath}`, {
          cwd: this.cwd,
          encoding: 'utf-8',
          timeout: this.gitTimeout,
          stdio: 'pipe',
        });
        return true;
      } catch {
        return false;
      }
    }
    try {
      await fs.access(path.resolve(this.cwd, filePath));
      return true;
    } catch {
      return false;
    }
  }

  _readFromGit(filePath, ref) {
    try {
      return execSync(`git show ${ref}:${filePath}`, {
        cwd: this.cwd,
        encoding: 'utf-8',
        timeout: this.gitTimeout,
        stdio: 'pipe',
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (err) {
      throw new Error(`Failed to read ${filePath} at ref ${ref}: ${err.message}`);
    }
  }
}

export const fileReader = new FileReader();
