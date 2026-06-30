/**
 * SAST Tool Installer
 *
 * Checks tool availability, suggests installation, skips gracefully
 * when tools are not available.
 */

export class ToolInstaller {
  constructor(options = {}) {
    this.availableTools = new Map(); // toolName → { available, version, path }
    this.checkedTools = new Map(); // Cache check results
  }

  /**
   * Check if a tool is available on the system.
   * @param {object} tool - Tool definition from registry
   * @returns {{ available: boolean, version?: string, path?: string, error?: string }}
   */
  async checkTool(tool) {
    if (this.checkedTools.has(tool.name)) {
      return this.checkedTools.get(tool.name);
    }

    let result;
    try {
      const { execSync } = await import('child_process');
      const version = execSync(tool.checkCommand, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      result = { available: true, version: version.split('\n')[0], path: tool.name };
    } catch (error) {
      result = {
        available: false,
        error: error.message?.split('\n')[0] || 'Not found',
        installCommand: tool.install,
        installType: tool.installType,
      };
    }

    this.checkedTools.set(tool.name, result);
    return result;
  }

  /**
   * Check availability of multiple tools.
   * @param {Array<object>} tools - Tool definitions
   * @returns {Map<string, object>} Results map
   */
  async checkTools(tools) {
    const results = new Map();

    // Check all tools in parallel with concurrency limit
    const concurrency = 5;
    for (let i = 0; i < tools.length; i += concurrency) {
      const batch = tools.slice(i, i + concurrency);
      const checks = await Promise.allSettled(
        batch.map(tool => this.checkTool(tool))
      );

      for (let j = 0; j < batch.length; j++) {
        const result = checks[j].status === 'fulfilled'
          ? checks[j].value
          : { available: false, error: checks[j].reason?.message };
        results.set(batch[j].name, result);
      }
    }

    this.availableTools = results;
    return results;
  }

  /**
   * Get only available tools from a list.
   */
  async getAvailableTools(tools) {
    const results = await this.checkTools(tools);
    return tools.filter(t => results.get(t.name)?.available);
  }

  /**
   * Suggest installation commands for missing tools.
   */
  getInstallSuggestions(tools) {
    const suggestions = [];
    for (const tool of tools) {
      const result = this.checkedTools.get(tool.name);
      if (result && !result.available) {
        suggestions.push({
          name: tool.name,
          category: tool.category,
          languages: tool.languages,
          installCommand: tool.install,
          installType: tool.installType,
          reason: result.error,
        });
      }
    }
    return suggestions;
  }

  /**
   * Print a summary of tool availability.
   */
  formatSummary(results) {
    const available = [];
    const missing = [];

    for (const [name, result] of results) {
      if (result.available) {
        available.push(`${name} (${result.version})`);
      } else {
        missing.push(`${name}: ${result.installCommand || 'install manually'}`);
      }
    }

    let summary = `SAST Tool Availability (${available.length}/${results.size})\n\n`;
    if (available.length > 0) {
      summary += `Available:\n${available.map(t => `  ✅ ${t}`).join('\n')}\n\n`;
    }
    if (missing.length > 0) {
      summary += `Missing:\n${missing.map(t => `  ❌ ${t}`).join('\n')}\n`;
    }

    return summary;
  }
}

export default ToolInstaller;
