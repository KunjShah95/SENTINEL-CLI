/**
 * Configuration schema validation using a lightweight validator
 * Falls back gracefully if zod is not available
 */

/**
 * Simple validator for config structure
 */
class ConfigValidator {
    constructor() {
        this.errors = [];
    }

    /**
     * Validate AI provider configuration
     */
    validateProvider(provider, index) {
        const errors = [];

        if (!provider.provider || typeof provider.provider !== 'string') {
            errors.push(`providers[${index}].provider must be a string`);
        }

        const validProviders = ['openai', 'groq', 'gemini', 'anthropic', 'openrouter', 'local'];
        if (provider.provider && !validProviders.includes(provider.provider)) {
            errors.push(`providers[${index}].provider must be one of: ${validProviders.join(', ')}`);
        }

        if (!provider.model || typeof provider.model !== 'string') {
            errors.push(`providers[${index}].model must be a string`);
        }

        if (provider.enabled !== undefined && typeof provider.enabled !== 'boolean') {
            errors.push(`providers[${index}].enabled must be a boolean`);
        }

        if (provider.weight !== undefined && typeof provider.weight !== 'number') {
            errors.push(`providers[${index}].weight must be a number`);
        }

        if (provider.apiKeyEnv && typeof provider.apiKeyEnv !== 'string') {
            errors.push(`providers[${index}].apiKeyEnv must be a string`);
        }

        return errors;
    }

    /**
     * Validate AI configuration
     */
    validateAI(aiConfig) {
        const errors = [];

        if (!aiConfig) {
            return errors; // AI config is optional
        }

        if (aiConfig.enabled !== undefined && typeof aiConfig.enabled !== 'boolean') {
            errors.push('ai.enabled must be a boolean');
        }

        if (aiConfig.provider && typeof aiConfig.provider !== 'string') {
            errors.push('ai.provider must be a string');
        }

        if (aiConfig.model && typeof aiConfig.model !== 'string') {
            errors.push('ai.model must be a string');
        }

        if (aiConfig.temperature !== undefined) {
            if (typeof aiConfig.temperature !== 'number' || aiConfig.temperature < 0 || aiConfig.temperature > 2) {
                errors.push('ai.temperature must be a number between 0 and 2');
            }
        }

        if (aiConfig.maxTokens !== undefined) {
            if (typeof aiConfig.maxTokens !== 'number' || aiConfig.maxTokens < 1) {
                errors.push('ai.maxTokens must be a positive number');
            }
        }

        if (aiConfig.providers) {
            if (!Array.isArray(aiConfig.providers)) {
                errors.push('ai.providers must be an array');
            } else {
                aiConfig.providers.forEach((provider, index) => {
                    errors.push(...this.validateProvider(provider, index));
                });
            }
        }

        return errors;
    }

    /**
     * Validate analyzers configuration
     */
    validateAnalyzers(analyzersConfig) {
        const errors = [];

        if (!analyzersConfig || typeof analyzersConfig !== 'object') {
            return errors; // Analyzers config is optional
        }

        const validAnalyzers = [
            'security', 'quality', 'bugs', 'performance', 'dependency',
            'accessibility', 'typescript', 'react', 'api', 'secrets',
            'custom', 'docker', 'kubernetes', 'go', 'vue'
        ];

        for (const [analyzer, enabled] of Object.entries(analyzersConfig)) {
            if (!validAnalyzers.includes(analyzer)) {
                errors.push(`Unknown analyzer: ${analyzer}. Valid analyzers: ${validAnalyzers.join(', ')}`);
            }

            if (typeof enabled !== 'boolean') {
                errors.push(`analyzers.${analyzer} must be a boolean`);
            }
        }

        return errors;
    }

    /**
     * Validate GitHub configuration
     */
    validateGitHub(githubConfig) {
        const errors = [];

        if (!githubConfig) {
            return errors; // GitHub config is optional
        }

        if (githubConfig.token && typeof githubConfig.token !== 'string') {
            errors.push('github.token must be a string');
        }

        if (githubConfig.baseUrl && typeof githubConfig.baseUrl !== 'string') {
            errors.push('github.baseUrl must be a string');
        }

        if (githubConfig.allowedHostnames) {
            if (!Array.isArray(githubConfig.allowedHostnames)) {
                errors.push('github.allowedHostnames must be an array');
            } else {
                githubConfig.allowedHostnames.forEach((hostname, index) => {
                    if (typeof hostname !== 'string') {
                        errors.push(`github.allowedHostnames[${index}] must be a string`);
                    }
                });
            }
        }

        if (githubConfig.enterprise) {
            if (typeof githubConfig.enterprise !== 'object') {
                errors.push('github.enterprise must be an object');
            } else {
                if (githubConfig.enterprise.baseUrl && typeof githubConfig.enterprise.baseUrl !== 'string') {
                    errors.push('github.enterprise.baseUrl must be a string');
                }
                if (githubConfig.enterprise.allowlist && !Array.isArray(githubConfig.enterprise.allowlist)) {
                    errors.push('github.enterprise.allowlist must be an array');
                }
            }
        }

        return errors;
    }

    /**
     * Validate entire configuration object
     */
    validate(config) {
        const errors = [];

        if (!config || typeof config !== 'object') {
            return { valid: false, errors: ['Configuration must be an object'] };
        }

        // Validate each section
        errors.push(...this.validateAI(config.ai));
        errors.push(...this.validateAnalyzers(config.analyzers));
        errors.push(...this.validateGitHub(config.github));

        // Validate output settings
        if (config.output) {
            if (config.output.format) {
                const validFormats = ['text', 'json', 'markdown', 'sarif', 'html'];
                if (!validFormats.includes(config.output.format)) {
                    errors.push(`output.format must be one of: ${validFormats.join(', ')}`);
                }
            }

            if (config.output.minSeverity) {
                const validSeverities = ['critical', 'high', 'medium', 'low', 'info'];
                if (!validSeverities.includes(config.output.minSeverity)) {
                    errors.push(`output.minSeverity must be one of: ${validSeverities.join(', ')}`);
                }
            }
        }

        // Validate rules
        if (config.rules && !Array.isArray(config.rules)) {
            errors.push('rules must be an array');
        }

        // Validate excludes
        if (config.exclude && !Array.isArray(config.exclude)) {
            errors.push('exclude must be an array');
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Validate and throw if invalid
     */
    validateOrThrow(config) {
        const result = this.validate(config);

        if (!result.valid) {
            const errorMessage = 'Configuration validation failed:\n' +
                result.errors.map(err => `  - ${err}`).join('\n');
            throw new Error(errorMessage);
        }

        return true;
    }
}

/**
 * Create a validated config with defaults
 */
export function createValidatedConfig(userConfig = {}) {
    const validator = new ConfigValidator();

    // Apply defaults
    const config = {
        ai: {
            enabled: true,
            provider: 'openai',
            model: 'gpt-3.5-turbo',
            temperature: 0.3,
            maxTokens: 2000,
            ...userConfig.ai
        },
        analyzers: {
            security: true,
            quality: true,
            bugs: true,
            performance: true,
            dependency: true,
            accessibility: true,
            typescript: true,
            react: true,
            api: true,
            secrets: true,
            ...userConfig.analyzers
        },
        output: {
            format: 'text',
            minSeverity: 'low',
            ...userConfig.output
        },
        github: userConfig.github || {},
        rules: userConfig.rules || [],
        exclude: userConfig.exclude || ['node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
        ...userConfig
    };

    // Validate the merged config
    validator.validateOrThrow(config);

    return config;
}

export const configValidator = new ConfigValidator();

export default configValidator;
