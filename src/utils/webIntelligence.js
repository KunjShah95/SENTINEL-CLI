import https from 'https';
import http from 'http';
import { URL } from 'url';

export class WebIntelligence {
  constructor(options = {}) {
    this.exaApiKey = options.exaApiKey || process.env.EXA_API_KEY;
    this.exaApiUrl = 'https://api.exa.ai/search';
    this.githubToken = options.githubToken || process.env.GITHUB_TOKEN;
    this.timeout = options.timeout || 30000;
  }

  async search(query, options = {}) {
    const numResults = options.numResults || 10;
    const category = options.category || null;

    if (!this.exaApiKey) {
      return this.fallbackSearch(query, numResults);
    }

    const body = JSON.stringify({
      query,
      numResults,
      ...(category && { category })
    });

    return new Promise((resolve) => {
      const req = https.request(this.exaApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.exaApiKey
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve({
              success: true,
              query,
              results: (json.results || []).map(r => ({
                title: r.title,
                url: r.url,
                snippet: r.snippet,
                published: r.published
              })),
              count: json.results?.length || 0
            });
          } catch (e) {
            resolve(this.fallbackSearch(query, numResults));
          }
        });
      });

      req.on('error', () => resolve(this.fallbackSearch(query, numResults)));
      req.write(body);
      req.end();
    });
  }

  fallbackSearch(query, numResults) {
    // Try DuckDuckGo Instant Answer API
    return this.duckDuckGoSearch(query, numResults);
  }

  /**
   * DuckDuckGo search fallback (no API key required)
   */
  async duckDuckGoSearch(query, numResults = 10) {
    return new Promise((resolve) => {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&num=${numResults}`;

      const req = http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const results = [];

            // Get related topics
            if (json.RelatedTopics && json.RelatedTopics.length > 0) {
              for (const topic of json.RelatedTopics) {
                if (topic.Text && topic.FirstURL) {
                  results.push({
                    title: topic.Text.split(' - ')[0] || 'Result',
                    url: topic.FirstURL,
                    snippet: topic.Text
                  });
                }
              }
            }

            // Get abstract if available
            if (json.AbstractText) {
              results.unshift({
                title: json.AbstractTitle || 'Summary',
                url: 'https://duckduckgo.com/?q=' + encodeURIComponent(query),
                snippet: json.AbstractText
              });
            }

            resolve({
              success: true,
              query,
              results: results.slice(0, numResults),
              count: results.length,
              source: 'duckduckgo'
            });
          } catch (e) {
            resolve({
              success: false,
              query,
              error: 'Failed to parse DuckDuckGo response',
              results: [],
              source: 'duckduckgo'
            });
          }
        });
      });

      req.on('error', () => {
        resolve({
          success: false,
          query,
          error: 'DuckDuckGo search failed',
          results: []
        });
      });

      req.setTimeout(10000, () => {
        req.destroy();
        resolve({
          success: false,
          query,
          error: 'Request timed out',
          results: []
        });
      });
    });
  }

  /**
   * SerpAPI fallback (requires API key but provides better results)
   */
  async serpSearch(query, numResults = 10) {
    const apiKey = process.env.SERP_API_KEY || process.env.SERPAPI_KEY;

    if (!apiKey) {
      return {
        success: false,
        query,
        error: 'SerpAPI key not configured. Set SERP_API_KEY or SERPAPI_KEY environment variable.',
        results: []
      };
    }

    return new Promise((resolve) => {
      const params = new URLSearchParams({
        q: query,
        api_key: apiKey,
        engine: 'google',
        num: numResults
      });

      const req = http.get(`https://serpapi.com/search?${params.toString()}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const results = (json.organic_results || []).map(r => ({
              title: r.title,
              url: r.link,
              snippet: r.snippet
            }));

            resolve({
              success: true,
              query,
              results,
              count: results.length,
              source: 'serpapi'
            });
          } catch (e) {
            resolve({
              success: false,
              query,
              error: 'Failed to parse SerpAPI response',
              results: []
            });
          }
        });
      });

      req.on('error', () => {
        resolve({
          success: false,
          query,
          error: 'SerpAPI search failed',
          results: []
        });
      });
    });
  }

  /**
   * StackOverflow search
   */
  async searchStackOverflow(query, options = {}) {
    const page = options.page || 1;
    const pageSize = options.pageSize || 10;

    return new Promise((resolve) => {
      const params = new URLSearchParams({
        q: query,
        site: 'stackoverflow',
        page,
        pagesize: pageSize,
        filter: 'withbody'
      });

      const req = http.get(`https://api.stackexchange.com/2.3/search?${params.toString()}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const results = (json.items || []).map(item => ({
              title: item.title,
              url: item.link,
              snippet: item.snippet || item.body,
              score: item.score,
              answered: item.is_answered,
              tags: item.tags || []
            }));

            resolve({
              success: true,
              query,
              results,
              count: results.length,
              source: 'stackoverflow',
              quotaRemaining: json.quota_remaining
            });
          } catch (e) {
            resolve({
              success: false,
              query,
              error: 'Failed to parse StackOverflow response',
              results: []
            });
          }
        });
      });

      req.on('error', () => {
        resolve({
          success: false,
          query,
          error: 'StackOverflow search failed',
          results: []
        });
      });
    });
  }

  /**
   * GitHub code search
   */
  async searchGitHubCode(query, options = {}) {
    const page = options.page || 1;
    const perPage = options.perPage || 10;
    const language = options.language || '';

    // Use GitHub Search API
    const url = language
      ? `https://api.github.com/search/code?q=${encodeURIComponent(query)}+language:${language}&per_page=${perPage}&page=${page}`
      : `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`;

    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Sentinel-CLI'
    };

    if (this.githubToken) {
      headers.Authorization = `token ${this.githubToken}`;
    }

    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const req = client.get(url, headers, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);

            if (res.statusCode >= 400) {
              resolve({
                success: false,
                query,
                error: json.message || 'GitHub search failed',
                results: []
              });
              return;
            }

            const results = (json.items || []).map(item => ({
              name: item.name,
              path: item.path,
              url: item.html_url,
              repository: {
                name: item.repository?.full_name,
                url: item.repository?.html_url
              },
              snippet: item.text_matches?.[0]?.fragment || ''
            }));

            resolve({
              success: true,
              query,
              results,
              count: results.length,
              source: 'github',
              total: json.total_count,
              quotaRemaining: res.headers['x-ratelimit-remaining']
            });
          } catch (e) {
            resolve({
              success: false,
              query,
              error: 'Failed to parse GitHub response',
              results: []
            });
          }
        });
      });

      req.on('error', () => {
        resolve({
          success: false,
          query,
          error: 'GitHub search failed',
          results: []
        });
      });
    });
  }

  /**
   * Documentation fetcher
   */
  async fetchDocs(url) {
    return await this.fetch(url, { maxLength: 100000 });
  }

  /**
   * Get top results summary
   */
  async topResults(query, numResults = 5) {
    const result = await this.search(query, { numResults });

    if (result.success && result.results.length > 0) {
      return {
        success: true,
        query,
        summary: result.results.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet
        })),
        count: result.results.length,
        source: result.source
      };
    }

    return result;
  }

  async fetch(url, options = {}) {
    const timeout = options.timeout || this.timeout;
    
    return new Promise((resolve) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const req = client.get(url, {
        headers: {
          'User-Agent': 'Sentinel-CLI/1.0',
          ...(this.githubToken && parsedUrl.hostname.includes('github') && {
            'Authorization': `token ${this.githubToken}`
          })
        }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(this.fetch(res.headers.location, options));
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            success: res.statusCode < 400,
            url,
            statusCode: res.statusCode,
            content: data.slice(0, options.maxLength || 50000),
            length: data.length,
            contentType: res.headers['content-type']
          });
        });
      });

      req.on('error', (e) => resolve({ success: false, url, error: e.message }));
      
      req.setTimeout(timeout, () => {
        req.destroy();
        resolve({ success: false, url, error: 'Request timed out' });
      });
    });
  }

  async searchCode(query, language = null) {
    const langFilter = language ? ` language:${language}` : '';
    return await this.search(`${query}${langFilter} code example`, { category: 'github' });
  }

  async searchDocs(query) {
    return await this.search(`${query} documentation`, { category: 'docs'     });
  }

  async searchNPM(packageName) {
    return await this.fetch(`https://registry.npmjs.org/${packageName}`);
  }

  async searchPyPI(packageName) {
    return await this.fetch(`https://pypi.org/pypi/${packageName}/json`);
  }

  async getGitHubRepo(owner, repo) {
    if (!this.githubToken) {
      return { success: false, error: 'GITHUB_TOKEN not set' };
    }
    
    return await this.fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Authorization: `token ${this.githubToken}` }
    });
  }

  async getGitHubIssues(owner, repo, options = {}) {
    const params = new URLSearchParams();
    if (options.state) params.set('state', options.state);
    if (options.labels) params.set('labels', options.labels);
    if (options.page) params.set('page', options.page.toString());
    
    const queryString = params.toString();
    const url = `https://api.github.com/repos/${owner}/${repo}/issues${queryString ? '?' + queryString : ''}`;
    
    return await this.fetch(url, {
      headers: this.githubToken ? { Authorization: `token ${this.githubToken}` } : {}
    });
  }

  async getGitHubContents(owner, repo, path = '') {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    return await this.fetch(url, {
      headers: this.githubToken ? { Authorization: `token ${this.githubToken}` } : {}
    });
  }
}

export default WebIntelligence;
