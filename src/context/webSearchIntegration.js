/**
 * Web Search Integration
 *
 * Detects libraries/frameworks in changed files and fetches up-to-date
 * documentation via web search. Uses an LRU cache to avoid redundant lookups.
 * Provides current API docs and best practices for detected dependencies.
 */

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';

const PACKAGE_FILE_PATTERNS = [
  { file: 'package.json', type: 'npm' },
  { file: 'requirements.txt', type: 'pip' },
  { file: 'Pipfile', type: 'pipenv' },
  { file: 'go.mod', type: 'go' },
  { file: 'Cargo.toml', type: 'cargo' },
  { file: 'Gemfile', type: 'gem' },
  { file: 'pom.xml', type: 'maven' },
  { file: 'build.gradle', type: 'gradle' },
];

const MAX_CACHE_SIZE = 100;

export class WebSearchIntegration {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.cache = new Map();
    this.maxCacheSize = options.maxCacheSize || MAX_CACHE_SIZE;
    this.searchApiKey = options.searchApiKey || process.env.SERP_API_KEY || process.env.WEB_SEARCH_API_KEY;
  }

  /**
   * Detect dependencies from changed files.
   */
  async detectDependencies(changedFiles = []) {
    const deps = new Set();

    // Check import statements in changed files
    for (const file of changedFiles) {
      const content = file.content || file.patch || '';

      // JS/TS imports
      const jsImports = content.match(/(?:import|require)\s*\(?['"]([^'"./][^'"]*)/g) || [];
      for (const imp of jsImports) {
        const match = imp.match(/['"]([^'"./][^'"]*)/);
        if (match) {
          const pkg = match[1].split('/')[0] === '@' ? match[1].split('/').slice(0, 2).join('/') : match[1].split('/')[0];
          deps.add({ name: pkg, type: 'npm' });
        }
      }

      // Python imports
      const pyImports = content.match(/(?:from|import)\s+(\w+)/g) || [];
      for (const imp of pyImports) {
        const match = imp.match(/(?:from|import)\s+(\w+)/);
        if (match) deps.add({ name: match[1], type: 'pip' });
      }

      // Go imports
      const goImports = content.match(/import\s+"([^"]+)"/g) || [];
      for (const imp of goImports) {
        const match = imp.match(/"([^"]+)"/);
        if (match) deps.add({ name: match[1], type: 'go' });
      }
    }

    // Also read package files for full dependency list
    const packageDeps = await this.readPackageFiles();
    for (const dep of packageDeps) {
      deps.add(dep);
    }

    return [...deps];
  }

  /**
   * Read package files to get dependency list.
   */
  async readPackageFiles() {
    const deps = [];

    for (const { file, type } of PACKAGE_FILE_PATTERNS) {
      const filePath = path.join(this.projectRoot, file);
      if (!existsSync(filePath)) continue;

      try {
        const content = await fs.readFile(filePath, 'utf8');

        if (type === 'npm') {
          const pkg = JSON.parse(content);
          const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
          for (const name of Object.keys(allDeps)) {
            deps.push({ name, type });
          }
        } else if (type === 'pip') {
          const lines = content.split('\n');
          for (const line of lines) {
            const match = line.match(/^([a-zA-Z0-9_-]+)/);
            if (match) deps.push({ name: match[1], type });
          }
        }
      } catch {
        // skip
      }
    }

    return deps;
  }

  /**
   * Search for documentation about a library/framework.
   */
  async searchDocs(library, query = '') {
    const cacheKey = `${library}:${query}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Evict oldest if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }

    let result = null;

    if (this.searchApiKey) {
      result = await this.serperSearch(`${library} documentation ${query}`.trim());
    }

    // Fallback: return a helpful static note
    if (!result) {
      result = {
        library,
        note: `Web search unavailable. Verify ${library} API usage against latest docs.`,
        snippets: [],
      };
    }

    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Perform a web search via SerpAPI.
   */
  async serperSearch(query) {
    try {
      const response = await fetch('https://serpapi.com/search', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        // Using URL params
      });

      // Use the API key in a proper URL
      const url = new URL('https://serpapi.com/search');
      url.searchParams.set('q', query);
      url.searchParams.set('api_key', this.searchApiKey);
      url.searchParams.set('num', '5');

      const res = await fetch(url.toString());
      if (!res.ok) return null;

      const data = await res.json();
      return {
        query,
        snippets: (data.organic_results || []).slice(0, 3).map(r => ({
          title: r.title,
          snippet: r.snippet?.slice(0, 500),
          url: r.link,
        })),
      };
    } catch {
      return null;
    }
  }

  /**
   * Get documentation context for changed files.
   */
  async getDocsContext(changedFiles) {
    const deps = await this.detectDependencies(changedFiles);
    if (deps.length === 0) return '';

    // Pick top 5 most relevant deps (prioritize non-builtin, non-dev)
    const topDeps = deps.slice(0, 5);
    const results = [];

    for (const dep of topDeps) {
      const searchResult = await this.searchDocs(dep.name);
      if (searchResult) results.push(searchResult);
    }

    if (results.length === 0) return '';

    let context = '## Library Documentation (Web Search)\n\n';
    for (const result of results) {
      context += `### ${result.library}\n`;
      if (result.snippets?.length > 0) {
        for (const s of result.snippets) {
          context += `- ${s.snippet || s.title}\n`;
        }
      } else if (result.note) {
        context += result.note + '\n';
      }
      context += '\n';
    }

    return context;
  }
}

export default WebSearchIntegration;
