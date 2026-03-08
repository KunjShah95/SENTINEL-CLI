import simpleGit from 'simple-git';

/**
 * Enhanced Git Operations
 * Provides advanced git workflow automation beyond pre-commit hooks
 */
export class EnhancedGit {
  constructor(repoPath = process.cwd()) {
    this.git = simpleGit(repoPath);
    this.repoPath = repoPath;
  }

  /**
   * Initialize a new repository
   */
  async init(options = {}) {
    const result = await this.git.init(options);
    return { success: true, result };
  }

  /**
   * Get repository status
   */
  async status() {
    const status = await this.git.status();
    return {
      current: status.current,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      staged: status.staged,
      modified: status.modified,
      deleted: status.deleted,
      untracked: status.not_added,
      conflicted: status.conflicted,
      isClean: status.isClean()
    };
  }

  /**
   * Get current branch info
   */
  async getCurrentBranch() {
    const branch = await this.git.branch();
    return {
      current: branch.current,
      name: branch.current,
      commits: branch.commits,
      loose: branch.loose
    };
  }

  /**
   * List all branches
   */
  async listBranches(options = {}) {
    const { remote = false } = options;
    
    if (remote) {
      const branches = await this.git.branch(['-r']);
      return {
        current: branches.current,
        branches: branches.all.filter(b => !b.includes('HEAD')),
        remotes: branches.remotes
      };
    }
    
    const branches = await this.git.branch();
    return {
      current: branches.current,
      local: branches.all.filter(b => !b.startsWith('remotes/')),
      all: branches.all
    };
  }

  /**
   * Create a new branch
   */
  async createBranch(branchName, options = {}) {
    const { checkout = true } = options;
    
    if (checkout) {
      await this.git.checkoutLocalBranch(branchName);
    } else {
      await this.git.branch([branchName]);
    }
    
    return { success: true, branchName };
  }

  /**
   * Switch branches
   */
  async checkout(branchName, options = {}) {
    const { create = false, force = false } = options;
    
    if (create) {
      await this.git.checkoutLocalBranch(branchName);
    } else {
      const args = force ? ['-f', branchName] : [branchName];
      await this.git.checkout(args);
    }
    
    return { success: true, branchName };
  }

  /**
   * Delete a branch
   */
  async deleteBranch(branchName, options = {}) {
    const { force = false, remote = false } = options;
    
    if (remote) {
      await this.git.push('origin', '--delete', branchName);
    } else {
      await this.git.deleteLocalBranch(branchName, force);
    }
    
    return { success: true, branchName, remote };
  }

  /**
   * Stage files
   */
  async stage(files = ['.']) {
    await this.git.add(files);
    return { success: true, staged: files };
  }

  /**
   * Unstage files
   */
  async unstage(files) {
    await this.git.reset(['HEAD', '--', ...files]);
    return { success: true, unstaged: files };
  }

  /**
   * Commit changes
   */
  async commit(message, options = {}) {
    const { all = false, amend = false, author } = options;
    
    const args = [];
    if (all) args.push('-a');
    if (amend) args.push('--amend');
    if (author) args.push('--author', author);
    args.push('-m', message);
    
    const result = await this.git.commit(message);
    
    return {
      success: true,
      commit: result.commit,
      summary: result.summary,
      branch: result.branch
    };
  }

  /**
   * Get commit history
   */
  async log(options = {}) {
    const { maxCount = 50, file = null, branch = null } = options;
    
    const args = [`--pretty=format:%H|%an|%ae|%at|%s`, `-n${maxCount}`];
    if (file) args.push('--', file);
    if (branch) args.push(branch);
    
    const result = await this.git.raw(['log', ...args]);
    const commits = result.trim().split('\n').filter(Boolean).map(line => {
      const [hash, author, email, timestamp, message] = line.split('|');
      return {
        hash,
        shortHash: hash.substring(0, 7),
        author,
        email,
        timestamp: parseInt(timestamp),
        date: new Date(parseInt(timestamp) * 1000).toISOString(),
        message
      };
    });
    
    return { commits, count: commits.length };
  }

  /**
   * Get diff between commits/ branches
   */
  async diff(from, to = 'HEAD', options = {}) {
    const { stat = false, nameOnly = false } = options;
    
    const args = [];
    if (stat) args.push('--stat');
    if (nameOnly) args.push('--name-only');
    args.push(from, to);
    
    const result = await this.git.diff(args);
    return { from, to, diff: result };
  }

  /**
   * Stash changes
   */
  async stash(options = {}) {
    const { message, pop = false, apply = false, drop = false, list = false } = options;
    
    if (list) {
      const stashes = await this.git.stashList();
      return { stashes: stashes.all, count: stashes.all.length };
    }
    
    if (pop) {
      await this.git.stash(['pop']);
      return { success: true, action: 'pop' };
    }
    
    if (apply) {
      await this.git.stash(['apply']);
      return { success: true, action: 'apply' };
    }
    
    if (drop) {
      await this.git.stash(['drop']);
      return { success: true, action: 'drop' };
    }
    
    const result = await this.git.stash(['push', ...(message ? ['-m', message] : [])]);
    return { success: true, action: 'push', result };
  }

  /**
   * Merge branches
   */
  async merge(branch, options = {}) {
    const { noFF = false, squash = false, message } = options;
    
    const args = [];
    if (noFF) args.push('--no-ff');
    if (squash) args.push('--squash');
    if (message) args.push('-m', message);
    args.push(branch);
    
    try {
      const result = await this.git.merge(args);
      return {
        success: true,
        branch,
        result: result.result,
        summary: result.summary
      };
    } catch (error) {
      return {
        success: false,
        branch,
        error: error.message,
        conflicts: error.conflicts || []
      };
    }
  }

  /**
   * Rebase onto branch
   */
  async rebase(onto, options = {}) {
    const { interactive = false, continue: cont = false, abort = false } = options;
    
    if (abort) {
      await this.git.rebase(['--abort']);
      return { success: true, action: 'abort' };
    }
    
    if (cont) {
      await this.git.rebase(['--continue']);
      return { success: true, action: 'continue' };
    }
    
    if (interactive) {
      await this.git.rebase(['-i', onto]);
    } else {
      await this.git.rebase([onto]);
    }
    
    return { success: true, onto };
  }

  /**
   * Cherry-pick commits
   */
  async cherryPick(commits, options = {}) {
    const { noCommit = false, edit = false } = options;
    
    const args = [...commits];
    if (noCommit) args.push('--no-commit');
    if (edit) args.push('-e');
    
    await this.git.raw(['cherry-pick', ...args]);
    
    return { success: true, commits };
  }

  /**
   * Reset to commit
   */
  async reset(commit, options = {}) {
    const { mode = 'mixed', hard = false } = options;
    
    const modeFlag = hard ? '--hard' : mode === 'soft' ? '--soft' : '--mixed';
    await this.git.reset([modeFlag, commit]);
    
    return { success: true, commit, mode: hard ? 'hard' : mode };
  }

  /**
   * Revert commits
   */
  async revert(commits, options = {}) {
    const { noCommit = false, edit = false } = options;
    
    const args = [...(Array.isArray(commits) ? commits : [commits])];
    if (noCommit) args.push('--no-commit');
    if (edit) args.push('-e');
    
    await this.git.raw(['revert', ...args]);
    
    return { success: true, commits };
  }

  /**
   * Tag operations
   */
  async tag(name, options = {}) {
    const { message, annotation = false, delete: del = false } = options;
    
    if (del) {
      await this.git.tag(['-d', name]);
      return { success: true, action: 'delete', name };
    }
    
    if (annotation && message) {
      await this.git.tag(['-a', name, '-m', message]);
    } else {
      await this.git.tag([name]);
    }
    
    return { success: true, action: 'create', name };
  }

  /**
   * Remote operations
   */
  async remote(options = {}) {
    const { add = null, remove = null, rename = null, list = false } = options;
    
    if (list) {
      const remotes = await this.git.getRemotes(true);
      return { remotes };
    }
    
    if (add) {
      await this.git.addRemote(add.name, add.url);
      return { success: true, action: 'add', name: add.name, url: add.url };
    }
    
    if (remove) {
      await this.git.removeRemote(remove);
      return { success: true, action: 'remove', name: remove };
    }
    
    if (rename) {
      await this.git.renameRemote(rename.old, rename.new);
      return { success: true, action: 'rename', old: rename.old, new: rename.new };
    }
    
    return { error: 'No remote operation specified' };
  }

  /**
   * Push to remote
   */
  async push(options = {}) {
    const { remote = 'origin', branch, force = false, tags = false, upstream = '-u' } = options;
    
    const args = [];
    if (force) args.push('--force');
    if (tags) args.push('--tags');
    if (upstream) args.push(upstream);
    args.push(remote);
    if (branch) args.push(branch);
    
    await this.git.push(args);
    
    return { success: true, remote, branch };
  }

  /**
   * Pull from remote
   */
  async pull(options = {}) {
    const { remote = 'origin', branch, rebase = false } = options;
    
    const args = [];
    if (rebase) args.push('--rebase');
    args.push(remote);
    if (branch) args.push(branch);
    
    await this.git.pull(args);
    
    return { success: true, remote, branch, rebase };
  }

  /**
   * Fetch from remote
   */
  async fetch(options = {}) {
    const { remote = 'origin', all = false, tags = false, prune = false } = options;
    
    const args = [];
    if (all) args.push('--all');
    if (tags) args.push('--tags');
    if (prune) args.push('--prune');
    args.push(remote);
    
    await this.git.fetch(args);
    
    return { success: true, remote };
  }

  /**
   * Get branches that need merging
   */
  async findMergedBranches(branch = 'main') {
    const result = await this.git.raw(['branch', '--merged', branch]);
    const branches = result.trim().split('\n').map(b => b.trim().replace('* ', '')).filter(Boolean);
    return { branch, merged: branches };
  }

  /**
   * Get contributors
   */
  async getContributors() {
    const result = await this.git.raw(['shortlog', '-sne', '--all']);
    const contributors = result.trim().split('\n').map(line => {
      const match = line.trim().match(/(\d+)\s+(.+)/);
      return {
        commits: parseInt(match?.[1] || '0'),
        name: match?.[2] || line.trim()
      };
    });
    return contributors;
  }

  /**
   * Get blame for file
   */
  async blame(file) {
    const result = await this.git.raw(['blame', '--line-porcelain', file]);
    return { file, raw: result };
  }

  /**
   * Create PR (GitHub CLI integration)
   */
  async createPR(options = {}) {
    const { title, body, base = 'main', head, draft = false, labels = [] } = options;
    
    const args = ['pr', 'create'];
    if (title) args.push('--title', title);
    if (body) args.push('--body', body);
    if (base) args.push('--base', base);
    if (head) args.push('--head', head);
    if (draft) args.push('--draft');
    if (labels.length) args.push('--label', labels.join(','));
    
    try {
      const result = await this.git.raw(args);
      return { success: true, url: result.trim() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export default EnhancedGit;
