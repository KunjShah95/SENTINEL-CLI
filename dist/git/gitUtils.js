import simpleGit from 'simple-git';

export class GitUtils {
  constructor() {
    this.git = simpleGit();
  }

  /**
   * Get the latest commit changes
   */
  async getLatestCommitChanges() {
    try {
      const log = await this.git.log({ maxCount: 1 });
      if (!log.latest) {
        return { commit: null, files: [] };
      }

      const diffOutput = await this.git.diff(['HEAD^1', 'HEAD']);
      const files = await this.git.diff(['HEAD^1', 'HEAD', '--name-only']);

      return {
        commit: log.latest,
        diff: diffOutput,
        files: files.split('\n').filter(Boolean),
      };
    } catch (error) {
      throw new Error(`Failed to get latest commit changes: ${error.message}`);
    }
  }

  /**
   * Get changes for a specific commit
   */
  async getCommitChanges(commitHash) {
    try {
      const commit = await this.git.show([commitHash, '--no-patch', '--format=%H|%an|%ae|%ad|%s']);
      const [hash, author, email, date, message] = commit.split('|');

      // Get diff for single commit
      const diffOutput = await this.git.diff([`${commitHash}^1`, commitHash]);
      const files = await this.git.diff([`${commitHash}^1`, commitHash, '--name-only']);

      return {
        commit: {
          hash,
          author,
          email,
          date,
          message,
        },
        diff: diffOutput,
        files: files.split('\n').filter(Boolean),
      };
    } catch (error) {
      throw new Error(`Failed to get commit changes for ${commitHash}: ${error.message}`);
    }
  }

  /**
   * Get staged changes (for pre-commit hooks)
   */
  async getStagedChanges() {
    try {
      const diffOutput = await this.git.diff(['--cached']);
      const files = await this.git.diff(['--cached', '--name-only']);

      return {
        diff: diffOutput,
        files: files.split('\n').filter(Boolean),
      };
    } catch (error) {
      throw new Error(`Failed to get staged changes: ${error.message}`);
    }
  }

  /**
   * Get all changed files in working directory
   */
  async getWorkingDirectoryChanges() {
    try {
      const status = await this.git.status();

      const modified = status.modified || [];
      const added = status.added || [];
      const deleted = status.deleted || [];
      const renamed = status.renamed || [];

      const allChangedFiles = [...modified, ...added, ...deleted, ...renamed];

      return {
        modified,
        added,
        deleted,
        renamed,
        allChanged: allChangedFiles,
        isClean: status.isClean(),
      };
    } catch (error) {
      throw new Error(`Failed to get working directory changes: ${error.message}`);
    }
  }

  /**
   * Parse unified diff into structured format
   */
  parseDiff(diffText) {
    const lines = diffText.split('\n');
    const files = [];
    let currentFile = null;
    let currentHunk = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // New file in diff
      if (line.startsWith('diff --git ')) {
        if (currentFile) {
          files.push(currentFile);
        }

        const filePath = line.match(/diff --git a\/(.+) b\/\1/)?.[1] || 'unknown';
        currentFile = {
          path: filePath,
          hunks: [],
          added: 0,
          deleted: 0,
        };
      }
      // File mode changes
      else if (
        line.startsWith('new file mode') ||
        line.startsWith('old mode') ||
        line.startsWith('index ')
      ) {
        if (currentFile) {
          currentFile.modeChange = line;
        }
      }
      // Hunk header
      else if (line.startsWith('@@')) {
        if (currentHunk && currentFile) {
          currentFile.hunks.push(currentHunk);
        }

        const hunkMatch = line.match(/@@ -(\d+),?(\d+)? \+(\d+),?(\d+)? @@/);
        if (hunkMatch) {
          const [, oldStart, oldLines, newStart, newLines] = hunkMatch;
          currentHunk = {
            oldStart: parseInt(oldStart),
            oldLines: parseInt(oldLines) || 0,
            newStart: parseInt(newStart),
            newLines: parseInt(newLines) || 0,
            content: [line],
            additions: [],
            deletions: [],
          };
        }
      }
      // Content lines
      else if (currentHunk) {
        currentHunk.content.push(line);

        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentHunk.additions.push({
            line: line.substring(1),
            lineNumber: currentHunk.newStart + currentHunk.additions.length,
            fullLine: line,
          });
          if (currentFile) currentFile.added++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentHunk.deletions.push({
            line: line.substring(1),
            lineNumber: currentHunk.oldStart + currentHunk.deletions.length,
            fullLine: line,
          });
          if (currentFile) currentFile.deleted++;
        }
      }
    }

    // Add the last file
    if (currentFile) {
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      files.push(currentFile);
    }

    return files;
  }

  /**
   * Get file content at specific commit
   */
  async getFileContentAtCommit(filePath, commitHash) {
    try {
      return await this.git.show([`${commitHash}:${filePath}`]);
    } catch (error) {
      // File might not exist at that commit
      return null;
    }
  }

  /**
   * Get file content in working directory
   */
  async getFileContent(filePath) {
    try {
      return await this.git.show([`HEAD:${filePath}`]);
    } catch (error) {
      // File might be new (not in repository)
      return null;
    }
  }

  /**
   * Get repository statistics
   */
  async getRepositoryStats() {
    try {
      const status = await this.git.status();
      const log = await this.git.log();
      const branches = await this.git.branch();

      return {
        currentBranch: branches.current,
        isClean: status.isClean(),
        ahead: branches.ahead || 0,
        behind: branches.behind || 0,
        modified: status.modified?.length || 0,
        staged: status.staged?.length || 0,
        untracked: status.untracked?.length || 0,
        totalCommits: log.all?.length || 0,
        latestCommit: log.latest,
      };
    } catch (error) {
      throw new Error(`Failed to get repository stats: ${error.message}`);
    }
  }

  /**
   * Get diff between two branches
   */
  async getBranchDiff(fromBranch, toBranch) {
    try {
      const diffOutput = await this.git.diff([fromBranch, toBranch]);
      const files = await this.git.diff([fromBranch, toBranch, '--name-only']);

      return {
        diff: diffOutput,
        files: files.split('\n').filter(Boolean),
      };
    } catch (error) {
      throw new Error(`Failed to get branch diff: ${error.message}`);
    }
  }

  /**
   * Check if current directory is a git repository
   */
  async isGitRepository() {
    try {
      await this.git.status();
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default GitUtils;
