import { promises as fs } from 'fs';
import path from 'path';

/**
 * Environment Loader for Sentinel CLI
 * Automatically loads .env files and provides secure API key management
 */

export class EnvLoader {
    constructor() {
        this.envCache = new Map();
        this.loaded = false;
    }

    /**
     * Load .env file from project root
     */
    async loadEnvFile() {
        if (this.loaded) return;

        const envPath = path.join(process.cwd(), '.env');

        try {
            const envContent = await fs.readFile(envPath, 'utf8');
            const envVars = this.parseEnvContent(envContent);

            // Set environment variables
            Object.entries(envVars).forEach(([key, value]) => {
                if (!process.env[key]) {
                    process.env[key] = value === 'undefined' ? '' : value;
                }
            });

            this.loaded = true;
            console.log('✅ Loaded environment variables from .env file');
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('ℹ️  No .env file found - using system environment variables');
            } else {
                console.warn('⚠️  Failed to load .env file:', error.message);
            }
            this.loaded = true;
        }
    }

    /**
     * Parse .env file content
     */
    parseEnvContent(content) {
        const envVars = {};
        const lines = content.split('\n');

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Skip empty lines and comments
            if (!trimmedLine || trimmedLine.startsWith('#')) {
                continue;
            }

            // Parse KEY=VALUE pairs
            const equalsIndex = trimmedLine.indexOf('=');
            if (equalsIndex > 0) {
                const key = trimmedLine.substring(0, equalsIndex).trim();
                let value = trimmedLine.substring(equalsIndex + 1).trim();

                // Remove quotes if present
                if (
                    (value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith('\'') && value.endsWith('\''))
                ) {
                    value = value.slice(1, -1);
                }

                envVars[key] = value;
            }
        }

        return envVars;
    }

    /**
     * Get API key for provider from environment
     */
    getApiKey(provider, apiKeyEnv) {
        const envKey = apiKeyEnv || this.getDefaultEnvKey(provider);

        if (!envKey) {
            throw new Error(`No environment variable defined for provider: ${provider}`);
        }

        const apiKey = process.env[envKey];

        if (!apiKey) {
            throw new Error(
                `Environment variable ${envKey} is not set. Please add it to your .env file.`
            );
        }

        return apiKey;
    }

    /**
     * Get default environment variable key for provider
     */
    getDefaultEnvKey(provider) {
        const envKeyMap = {
            openai: 'OPENAI_API_KEY',
            anthropic: 'ANTHROPIC_API_KEY',
            gemini: 'GEMINI_API_KEY',
            groq: 'GROQ_API_KEY',
            openrouter: 'OPENROUTER_API_KEY',
            github: 'GITHUB_TOKEN',
            gitlab: 'GITLAB_TOKEN',
        };

        return envKeyMap[provider?.toLowerCase()];
    }

    /**
     * Validate required environment variables
     */
    validateEnvVars(requiredVars) {
        const missing = [];

        for (const envVar of requiredVars) {
            if (!process.env[envVar]) {
                missing.push(envVar);
            }
        }

        if (missing.length > 0) {
            throw new Error(
                `Missing required environment variables: ${missing.join(', ')}\n` +
                'Please add them to your .env file or set them in your system environment.'
            );
        }

        return true;
    }

    /**
     * Check if environment variable is set
     */
    hasEnvVar(envVar) {
        return Boolean(process.env[envVar]);
    }

    /**
     * Get all relevant API keys for Sentinel
     */
    getAllApiKeys() {
        const allKeys = [
            'OPENAI_API_KEY',
            'ANTHROPIC_API_KEY',
            'GEMINI_API_KEY',
            'GROQ_API_KEY',
            'OPENROUTER_API_KEY',
            'GITHUB_TOKEN',
            'GITLAB_TOKEN',
        ];

        const availableKeys = {};
        allKeys.forEach(key => {
            if (process.env[key]) {
                availableKeys[key] = process.env[key];
            }
        });

        return availableKeys;
    }

    /**
     * Initialize environment loader
     */
    async initialize() {
        await this.loadEnvFile();
        return this;
    }
}

// Export singleton instance
export default new EnvLoader();
