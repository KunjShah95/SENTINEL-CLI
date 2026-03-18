import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';

export class PluginManager {
    constructor(options = {}) {
        this.projectPath = options.projectPath || process.cwd();
        this.pluginsDir = path.join(this.projectPath, '.sentinel', 'plugins');
        this.plugins = new Map();
    }

    async loadPlugins() {
        try {
            await fs.mkdir(this.pluginsDir, { recursive: true });
        } catch (e) {}

        const entries = await fs.readdir(this.pluginsDir, { withFileTypes: true });
        
        for (const entry of entries) {
            if (entry.isDirectory()) {
                await this.loadPlugin(entry.name);
            }
        }
        
        return this.plugins;
    }

    async loadPlugin(pluginName) {
        const pluginPath = path.join(this.pluginsDir, pluginName);
        
        try {
            const manifestPath = path.join(pluginPath, 'plugin.json');
            const manifestContent = await fs.readFile(manifestPath, 'utf8');
            const manifest = JSON.parse(manifestContent);
            
            const plugin = {
                name: manifest.name || pluginName,
                version: manifest.version || '1.0.0',
                description: manifest.description || '',
                analyzers: manifest.analyzers || [],
                hooks: manifest.hooks || {},
                enabled: manifest.enabled !== false,
                path: pluginPath
            };
            
            if (manifest.entry) {
                const entryPath = path.join(pluginPath, manifest.entry);
                try {
                    const module = await import(entryPath);
                    plugin.module = module.default || module;
                } catch (e) {
                    console.log(chalk.yellow(`  ⚠ Plugin ${pluginName}: Failed to load entry point`));
                }
            }
            
            this.plugins.set(pluginName, plugin);
            console.log(chalk.green(`  ✓ Loaded plugin: ${pluginName}`));
            
        } catch (e) {
            console.log(chalk.yellow(`  ⚠ Could not load plugin ${pluginName}: ${e.message}`));
        }
    }

    async createPlugin(name, options = {}) {
        const pluginPath = path.join(this.pluginsDir, name);
        
        try {
            await fs.mkdir(pluginPath, { recursive: true });
        } catch (e) {
            throw new Error(`Plugin directory already exists: ${name}`);
        }
        
        const manifest = {
            name,
            version: '1.0.0',
            description: options.description || `Custom analyzer: ${name}`,
            enabled: true,
            entry: 'index.js',
            analyzers: [
                {
                    id: name,
                    name: options.analyzerName || `${name} Analyzer`,
                    description: options.description || `Custom analyzer for ${name}`,
                    severity: options.severity || 'medium'
                }
            ],
            hooks: {
                'beforeAnalyze': [],
                'afterAnalyze': [],
                'onIssue': []
            }
        };
        
        await fs.writeFile(
            path.join(pluginPath, 'plugin.json'),
            JSON.stringify(manifest, null, 2)
        );
        
        const template = `/**
 * ${name} Analyzer
 * Custom Sentinel analyzer plugin
 */

export default {
    name: '${name}',
    version: '1.0.0',
    
    /**
     * Analyze code and return issues
     * @param {string} file - File path
     * @param {string} content - File content
     * @param {Object} context - Analysis context
     * @returns {Promise<Array>} Array of issues
     */
    async analyze(file, content, context = {}) {
        const issues = [];
        
        // Your analysis logic here
        // Example:
        // if (content.includes('TODO')) {
        //     issues.push({
        //         file,
        //         line: content.split('\\n').findIndex(l => l.includes('TODO')) + 1,
        //         message: 'TODO comment found',
        //         severity: 'low',
        //         analyzer: '${name}',
        //         suggestion: 'Complete the TODO or create a tracking issue'
        //     });
        // }
        
        return issues;
    },
    
    /**
     * Fix an issue
     * @param {Object} issue - Issue to fix
     * @param {string} content - File content
     * @returns {Promise<string>} Fixed content
     */
    async fix(issue, content) {
        // Your fix logic here
        return content;
    },
    
    /**
     * Get configuration schema
     * @returns {Object} JSON Schema
     */
    getConfigSchema() {
        return {
            type: 'object',
            properties: {
                enabled: {
                    type: 'boolean',
                    default: true
                }
            }
        };
    }
};
`;
        
        await fs.writeFile(path.join(pluginPath, 'index.js'), template);
        
        console.log(chalk.green(`\n  ✓ Plugin "${name}" created at ${pluginPath}`));
        console.log(chalk.gray('  \n  Edit the following files to customize:'));
        console.log(chalk.gray(`    - ${path.join(pluginPath, 'plugin.json')}`));
        console.log(chalk.gray(`    - ${path.join(pluginPath, 'index.js')}\n`));
        
        return { name, path: pluginPath };
    }

    getPlugin(name) {
        return this.plugins.get(name);
    }

    getAllPlugins() {
        return Array.from(this.plugins.values());
    }

    async enablePlugin(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) {
            throw new Error(`Plugin not found: ${name}`);
        }
        
        plugin.enabled = true;
        await this.saveManifest(plugin);
        
        return plugin;
    }

    async disablePlugin(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) {
            throw new Error(`Plugin not found: ${name}`);
        }
        
        plugin.enabled = false;
        await this.saveManifest(plugin);
        
        return plugin;
    }

    async saveManifest(plugin) {
        const manifestPath = path.join(plugin.path, 'plugin.json');
        const manifest = {
            name: plugin.name,
            version: plugin.version,
            description: plugin.description,
            enabled: plugin.enabled,
            analyzers: plugin.analyzers,
            hooks: plugin.hooks
        };
        
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    }

    async runPluginAnalyzer(pluginName, file, content, context = {}) {
        const plugin = this.plugins.get(pluginName);
        
        if (!plugin) {
            throw new Error(`Plugin not found: ${pluginName}`);
        }
        
        if (!plugin.enabled) {
            throw new Error(`Plugin is disabled: ${pluginName}`);
        }
        
        if (!plugin.module || !plugin.module.analyze) {
            throw new Error(`Plugin has no analyze function: ${pluginName}`);
        }
        
        return plugin.module.analyze(file, content, context);
    }
}

export class PluginSDK {
    constructor(options = {}) {
        this.projectPath = options.projectPath || process.cwd();
    }

    createAnalyzer(name, config = {}) {
        return {
            name,
            config,
            
            analyze: async function(file, content, context = {}) {
                throw new Error('analyze() must be implemented');
            },
            
            fix: async function(issue, content) {
                throw new Error('fix() must be implemented');
            },
            
            getConfigSchema: function() {
                return { type: 'object' };
            }
        };
    }

    createRule(rule) {
        return {
            id: rule.id || `rule-${Date.now()}`,
            pattern: rule.pattern,
            message: rule.message,
            severity: rule.severity || 'medium',
            suggestion: rule.suggestion,
            filePattern: rule.filePattern || '.*'
        };
    }

    createHook(type, handler) {
        const validHooks = ['beforeAnalyze', 'afterAnalyze', 'onIssue', 'onFix', 'onInit'];
        
        if (!validHooks.includes(type)) {
            throw new Error(`Invalid hook type: ${type}. Valid: ${validHooks.join(', ')}`);
        }
        
        return { type, handler };
    }
}

export async function runPluginCommand(args, options = {}) {
    const manager = new PluginManager(options);
    const action = args[0] || 'list';
    
    switch (action) {
        case 'list': {
            await manager.loadPlugins();
            console.log(chalk.cyan('\n  Loaded Plugins:\n'));
            const plugins = manager.getAllPlugins();
            if (plugins.length === 0) {
                console.log(chalk.gray('    No plugins installed\n'));
            } else {
                for (const plugin of plugins) {
                    const status = plugin.enabled ? chalk.green('✓') : chalk.red('✗');
                    console.log(`    ${status} ${plugin.name} (${plugin.version})`);
                    console.log(chalk.gray(`      ${plugin.description}`));
                }
            }
            break;
        }
        
        case 'create': {
            const name = args[1];
            if (!name) {
                console.log(chalk.red('  Usage: sentinel plugin create <name>'));
                return;
            }
            await manager.createPlugin(name);
            break;
        }
        
        case 'enable': {
            const name = args[1];
            if (!name) {
                console.log(chalk.red('  Usage: sentinel plugin enable <name>'));
                return;
            }
            await manager.loadPlugins();
            await manager.enablePlugin(name);
            console.log(chalk.green(`  ✓ Plugin "${name}" enabled`));
            break;
        }
        
        case 'disable': {
            const name = args[1];
            if (!name) {
                console.log(chalk.red('  Usage: sentinel plugin disable <name>'));
                return;
            }
            await manager.loadPlugins();
            await manager.disablePlugin(name);
            console.log(chalk.green(`  ✓ Plugin "${name}" disabled`));
            break;
        }
        
        default:
            console.log(chalk.gray('  Commands:'));
            console.log(chalk.gray('    list     - List loaded plugins'));
            console.log(chalk.gray('    create   - Create new plugin'));
            console.log(chalk.gray('    enable   - Enable a plugin'));
            console.log(chalk.gray('    disable  - Disable a plugin'));
    }
    
    return manager;
}

export default { PluginManager, PluginSDK, runPluginCommand };
