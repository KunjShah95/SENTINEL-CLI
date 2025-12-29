/**
 * Sentinel Configuration Manager
 * 
 * Looks for configuration in the following locations (in order of priority):
 * 1. ./.sentinel.json (local directory - highest priority)
 * 2. $XDG_CONFIG_HOME/sentinel/.sentinel.json
 * 3. $HOME/.sentinel.json (global config)
 * 
 * API keys are stored securely and never committed to version control.
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

class ConfigManager {
    constructor() {
        this.configFileName = '.sentinel.json';
        this.config = null;
        this.configPath = null;

        // Default configuration structure
        this.defaultConfig = {
            // Data directory for caches and history
            data: {
                directory: '.sentinel'
            },

            // AI Provider configurations
            providers: {
                openai: {
                    apiKey: '',
                    disabled: false
                },
                anthropic: {
                    apiKey: '',
                    disabled: false
                },
                gemini: {
                    apiKey: '',
                    disabled: false
                },
                groq: {
                    apiKey: '',
                    disabled: false
                },
                openrouter: {
                    apiKey: '',
                    disabled: false
                },
                copilot: {
                    disabled: true
                }
            },

            // Agent configurations
            agents: {
                coder: {
                    model: 'gpt-4o-mini',
                    maxTokens: 5000
                },
                task: {
                    model: 'claude-3-5-sonnet-20241022',
                    maxTokens: 5000
                },
                title: {
                    model: 'gpt-4o-mini',
                    maxTokens: 80
                }
            },

            // Shell configuration
            shell: {
                path: process.platform === 'win32' ? 'powershell' : '/bin/bash',
                args: process.platform === 'win32' ? [] : ['-l']
            },

            // MCP Server configurations
            mcpServers: {},

            // LSP configurations
            lsp: {
                typescript: {
                    disabled: false,
                    command: 'typescript-language-server'
                }
            },

            // Debug settings
            debug: false,
            debugLSP: false,
            autoCompact: true
        };
    }

    /**
     * Get all possible config file paths in order of priority
     */
    getConfigPaths() {
        const paths = [];

        // 1. Local directory (highest priority)
        paths.push(path.join(process.cwd(), this.configFileName));

        // 2. XDG_CONFIG_HOME
        const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
        paths.push(path.join(xdgConfigHome, 'sentinel', this.configFileName));

        // 3. Home directory (global config)
        paths.push(path.join(os.homedir(), this.configFileName));

        return paths;
    }

    /**
     * Find the first existing config file
     */
    async findConfigFile() {
        const paths = this.getConfigPaths();

        for (const configPath of paths) {
            try {
                await fs.access(configPath);
                return configPath;
            } catch {
                continue;
            }
        }

        return null;
    }

    /**
     * Get the default config path (global home directory)
     */
    getDefaultConfigPath() {
        return path.join(os.homedir(), this.configFileName);
    }

    /**
     * Load configuration from file
     */
    async load() {
        const existingPath = await this.findConfigFile();

        if (existingPath) {
            try {
                const data = await fs.readFile(existingPath, 'utf8');
                this.config = this.mergeDeep(this.defaultConfig, JSON.parse(data));
                this.configPath = existingPath;
                return this.config;
            } catch (error) {
                console.warn(`Warning: Could not parse config at ${existingPath}: ${error.message}`);
            }
        }

        // No config found, use defaults
        this.config = { ...this.defaultConfig };
        this.configPath = this.getDefaultConfigPath();
        return this.config;
    }

    /**
     * Save configuration to file
     */
    async save(config = null, targetPath = null) {
        const configToSave = config || this.config;
        const savePath = targetPath || this.configPath || this.getDefaultConfigPath();

        // Ensure parent directory exists
        const dir = path.dirname(savePath);
        try {
            await fs.mkdir(dir, { recursive: true });
        } catch {
            // Directory might already exist
        }

        // Write with restricted permissions (readable only by owner)
        await fs.writeFile(savePath, JSON.stringify(configToSave, null, 2), { mode: 0o600 });

        this.config = configToSave;
        this.configPath = savePath;

        return savePath;
    }

    /**
     * Get a configuration value by dot-notation path
     */
    get(key) {
        if (!this.config) return null;

        const parts = key.split('.');
        let value = this.config;

        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return null;
            }
        }

        return value;
    }

    /**
     * Set a configuration value by dot-notation path
     */
    set(key, value) {
        if (!this.config) this.config = { ...this.defaultConfig };

        const parts = key.split('.');
        let target = this.config;

        for (let i = 0; i < parts.length - 1; i++) {
            if (!(parts[i] in target) || typeof target[parts[i]] !== 'object') {
                target[parts[i]] = {};
            }
            target = target[parts[i]];
        }

        target[parts[parts.length - 1]] = value;
    }

    /**
     * Set an API key for a provider
     */
    async setApiKey(provider, apiKey) {
        await this.load();

        if (!this.config.providers) {
            this.config.providers = {};
        }

        if (!this.config.providers[provider]) {
            this.config.providers[provider] = { apiKey: '', disabled: false };
        }

        this.config.providers[provider].apiKey = apiKey;

        if (apiKey) {
            this.config.providers[provider].disabled = false;
        }

        return await this.save();
    }

    /**
     * Get an API key for a provider
     */
    getApiKey(provider) {
        return this.config?.providers?.[provider]?.apiKey || null;
    }

    /**
     * Check if a provider is enabled
     */
    isProviderEnabled(provider) {
        const providerConfig = this.config?.providers?.[provider];
        if (!providerConfig) return false;
        return !providerConfig.disabled && !!providerConfig.apiKey;
    }

    /**
     * Get all configured providers
     */
    getConfiguredProviders() {
        if (!this.config?.providers) return [];

        return Object.entries(this.config.providers)
            .filter(([_, settings]) => settings.apiKey && !settings.disabled)
            .map(([name]) => name);
    }

    /**
     * Deep merge utility
     */
    mergeDeep(target, source) {
        const isObject = obj => obj && typeof obj === 'object' && !Array.isArray(obj);

        if (!isObject(target) || !isObject(source)) {
            return source;
        }

        const result = { ...target };

        for (const key of Object.keys(source)) {
            if (isObject(source[key])) {
                result[key] = this.mergeDeep(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }

        return result;
    }

    /**
     * Get masked version of config (hides API keys)
     */
    getMaskedConfig() {
        const masked = JSON.parse(JSON.stringify(this.config || {}));

        if (masked.providers) {
            for (const [provider, settings] of Object.entries(masked.providers)) {
                if (settings.apiKey) {
                    const key = settings.apiKey;
                    masked.providers[provider].apiKey = key.length > 8
                        ? `${key.slice(0, 4)}${'*'.repeat(key.length - 8)}${key.slice(-4)}`
                        : '********';
                }
            }
        }

        return masked;
    }

    /**
     * Inject API keys into environment variables
     */
    injectEnvVars() {
        if (!this.config?.providers) return;

        const envMap = {
            openai: 'OPENAI_API_KEY',
            anthropic: 'ANTHROPIC_API_KEY',
            gemini: 'GEMINI_API_KEY',
            groq: 'GROQ_API_KEY',
            openrouter: 'OPENROUTER_API_KEY'
        };

        for (const [provider, envKey] of Object.entries(envMap)) {
            const apiKey = this.config.providers[provider]?.apiKey;
            if (apiKey && !process.env[envKey]) {
                process.env[envKey] = apiKey;
            }
        }
    }
}

// Export singleton instance
export const configManager = new ConfigManager();
export default configManager;
