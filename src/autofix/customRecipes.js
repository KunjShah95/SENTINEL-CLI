/**
 * Custom Recipes
 *
 * Execute reusable named automation tasks defined in .sentinel.yaml.
 * Recipes are like macros — a sequence of operations triggered by name.
 */

import { configManager } from '../config/configManager.js';

export class CustomRecipes {
  constructor(options = {}) {
    this.config = options.config || configManager;
    this.llmClient = options.llmClient || null;
    this.builtInRecipes = {
      'sort-imports': this.sortImports.bind(this),
      'add-license-header': this.addLicenseHeader.bind(this),
      'remove-console-logs': this.removeConsoleLogs.bind(this),
      'add-newline-at-eof': this.addNewlineAtEOF.bind(this),
      'trim-trailing-whitespace': this.trimTrailingWhitespace.bind(this),
    };
  }

  /**
   * Execute a named recipe.
   */
  async execute(recipeName, context = {}) {
    // Check built-in recipes first
    if (this.builtInRecipes[recipeName]) {
      return this.builtInRecipes[recipeName](context);
    }

    // Check config-defined recipes
    await this.config.load();
    const recipes = this.config.getFinishingTouches().custom_recipes || [];
    const recipe = recipes.find(r => r.name === recipeName);

    if (!recipe) {
      return { success: false, error: `Recipe '${recipeName}' not found` };
    }

    // Execute via LLM using the recipe instructions
    if (this.llmClient && recipe.instructions) {
      return this.executeWithLLM(recipe, context);
    }

    return { success: false, error: `Recipe '${recipeName}' has no executor or LLM client` };
  }

  /**
   * List all available recipes (built-in + config).
   */
  async listRecipes() {
    const builtIn = Object.keys(this.builtInRecipes).map(name => ({
      name,
      source: 'built-in',
    }));

    await this.config.load();
    const custom = (this.config.getFinishingTouches().custom_recipes || []).map(r => ({
      name: r.name,
      source: 'config',
      instructions: r.instructions,
    }));

    return [...builtIn, ...custom];
  }

  /**
   * Execute a recipe using LLM.
   */
  async executeWithLLM(recipe, context) {
    const files = context.changedFiles || [];
    const results = [];

    for (const file of files) {
      try {
        const prompt = `${recipe.instructions}

File: ${file.path}
Content:
\`\`\`
${file.content || ''}
\`\`\`

Apply the recipe instructions to this file. Return ONLY the modified file content, no explanations.`;

        const response = await this.llmClient.chat(
          [{ role: 'user', content: prompt }],
          { maxTokens: 4000, timeout: 30_000 }
        );

        const content = (response.content || response.message?.content || '')
          .replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();

        if (content && content !== (file.content || '')) {
          results.push({
            path: file.path,
            content,
            modified: true,
          });
        }
      } catch (error) {
        results.push({
          path: file.path,
          error: error.message,
          modified: false,
        });
      }
    }

    return { success: true, recipe: recipe.name, results };
  }

  // ─── Built-in Recipes ────────────────────────────────────────────────────

  async sortImports(context) {
    const files = context.changedFiles || [];
    const results = [];

    for (const file of files) {
      const content = file.content || '';
      const ext = file.path.match(/\.\w+$/)?.[0];
      if (!['.js', '.jsx', '.ts', '.tsx'].includes(ext)) continue;

      const lines = content.split('\n');
      const imports = [];
      const otherLines = [];

      for (const line of lines) {
        if (line.match(/^import\s/) || line.match(/^const\s.*\s*=\s*require\(/)) {
          imports.push(line);
        } else {
          otherLines.push(line);
        }
      }

      // Sort: side effects first, then alphabetical
      imports.sort((a, b) => {
        const aName = a.match(/from\s+['"]([^'"]+)['"]/)?.[1] || a.match(/require\(['"]([^'"]+)['"]\)/)?.[1] || '';
        const bName = b.match(/from\s+['"]([^'"]+)['"]/)?.[1] || b.match(/require\(['"]([^'"]+)['"]\)/)?.[1] || '';
        return aName.localeCompare(bName);
      });

      const sorted = [...imports, '', ...otherLines].join('\n');

      if (sorted !== content) {
        results.push({ path: file.path, content: sorted, modified: true });
      }
    }

    return { success: true, recipe: 'sort-imports', results };
  }

  async addLicenseHeader(context) {
    const license = context.license || '// MIT License';
    const files = context.changedFiles || [];
    const results = [];

    for (const file of files) {
      const content = file.content || '';
      if (content.includes('License') || content.includes('license')) continue;

      results.push({
        path: file.path,
        content: `${license}\n\n${content}`,
        modified: true,
      });
    }

    return { success: true, recipe: 'add-license-header', results };
  }

  async removeConsoleLogs(context) {
    const files = context.changedFiles || [];
    const results = [];

    for (const file of files) {
      const content = file.content || '';
      const cleaned = content.replace(/^\s*console\.(log|warn|error|debug|info)\(.*\);?\s*$/gm, '');

      if (cleaned !== content) {
        results.push({ path: file.path, content: cleaned, modified: true });
      }
    }

    return { success: true, recipe: 'remove-console-logs', results };
  }

  async addNewlineAtEOF(context) {
    const files = context.changedFiles || [];
    const results = [];

    for (const file of files) {
      const content = file.content || '';
      if (content && !content.endsWith('\n')) {
        results.push({ path: file.path, content: content + '\n', modified: true });
      }
    }

    return { success: true, recipe: 'add-newline-at-eof', results };
  }

  async trimTrailingWhitespace(context) {
    const files = context.changedFiles || [];
    const results = [];

    for (const file of files) {
      const content = file.content || '';
      const trimmed = content.split('\n').map(l => l.trimEnd()).join('\n');

      if (trimmed !== content) {
        results.push({ path: file.path, content: trimmed, modified: true });
      }
    }

    return { success: true, recipe: 'trim-trailing-whitespace', results };
  }
}

export default CustomRecipes;
