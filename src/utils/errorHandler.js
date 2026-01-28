/**
 * Centralized error handling system for Sentinel CLI
 */

export class SentinelError extends Error {
    constructor(message, code, severity = 'medium', context = {}) {
        super(message);
        this.name = 'SentinelError';
        this.code = code;
        this.severity = severity;
        this.context = context;
        this.timestamp = new Date().toISOString();

        // Maintains proper stack trace
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            severity: this.severity,
            context: this.context,
            timestamp: this.timestamp,
            stack: this.stack
        };
    }
}

export class ValidationError extends SentinelError {
    constructor(message, context) {
        super(message, 'VALIDATION_ERROR', 'low', context);
        this.name = 'ValidationError';
    }
}

export class SecurityError extends SentinelError {
    constructor(message, context) {
        super(message, 'SECURITY_ERROR', 'critical', context);
        this.name = 'SecurityError';
    }
}

export class ConfigurationError extends SentinelError {
    constructor(message, context) {
        super(message, 'CONFIG_ERROR', 'high', context);
        this.name = 'ConfigurationError';
    }
}

export class AnalyzerError extends SentinelError {
    constructor(message, analyzer, context) {
        super(message, 'ANALYZER_ERROR', 'medium', { ...context, analyzer });
        this.name = 'AnalyzerError';
    }
}

class ErrorHandler {
    constructor() {
        this.handlers = [];
        this.monitoringEnabled = false;
    }

    /**
     * Register a custom error handler
     */
    registerHandler(handler) {
        if (typeof handler === 'function') {
            this.handlers.push(handler);
        }
    }

    /**
     * Enable monitoring integration (Sentry, Datadog, etc.)
     */
    enableMonitoring(config = {}) {
        this.monitoringEnabled = true;
        this.monitoringConfig = config;
    }

    /**
     * Log structured error data
     */
    async logError(error) {
        const errorData = {
            timestamp: new Date().toISOString(),
            level: 'error',
            name: error.name || 'Error',
            message: error.message,
            code: error.code || 'UNKNOWN_ERROR',
            severity: error.severity || 'medium',
            context: error.context || {},
            stack: error.stack
        };

        // Console logging with colors
        if (process.env.NODE_ENV !== 'test') {
            try {
                const chalk = await import('chalk');
                const severityColors = {
                    critical: chalk.default.red.bold,
                    high: chalk.default.red,
                    medium: chalk.default.yellow,
                    low: chalk.default.blue,
                    info: chalk.default.gray
                };

                const colorFn = severityColors[errorData.severity] || chalk.default.white;
                console.error(colorFn(`[${errorData.severity.toUpperCase()}] ${errorData.message}`));

                if (process.env.DEBUG) {
                    console.error(chalk.default.gray(errorData.stack));
                }
            } catch {
                console.error(`[${errorData.severity?.toUpperCase()}] ${errorData.message}`);
            }
        }

        return errorData;
    }

    /**
     * Send error to monitoring service
     */
    async sendToMonitoring(_errorData) {
        if (!this.monitoringEnabled) return;

        // Placeholder for monitoring integration
        // In production, integrate with Sentry, Datadog, etc.
        try {
            if (this.monitoringConfig.sentryDsn) {
                // await Sentry.captureException(errorData);
            }
        } catch (monitoringError) {
            console.error('Failed to send error to monitoring:', monitoringError.message);
        }
    }

    /**
     * Main error handling function
     */
    async handle(error) {
        // Convert to SentinelError if needed
        const sentinelError = error instanceof SentinelError
            ? error
            : new SentinelError(error.message, 'UNKNOWN_ERROR', 'medium', { originalError: error.name });

        // Log the error
        const errorData = await this.logError(sentinelError);

        // Send to monitoring
        await this.sendToMonitoring(errorData);

        // Execute custom handlers
        for (const handler of this.handlers) {
            try {
                await handler(sentinelError, errorData);
            } catch (handlerError) {
                console.error('Error in custom handler:', handlerError.message);
            }
        }

        return errorData;
    }

    /**
     * Wrap async function with error handling
     */
    wrapAsync(fn) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                await this.handle(error);
                throw error;
            }
        };
    }

    /**
     * Create a try-catch wrapper
     */
    async tryExecute(fn, fallbackValue = null) {
        try {
            return await fn();
        } catch (error) {
            await this.handle(error);
            return fallbackValue;
        }
    }
}

// Singleton instance
export const errorHandler = new ErrorHandler();

/**
 * Global error handlers for unhandled errors
 */
export function setupGlobalErrorHandlers() {
    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
        const error = new SentinelError(
            `Unhandled Promise Rejection: ${reason}`,
            'UNHANDLED_REJECTION',
            'high',
            { promise: promise.toString() }
        );
        await errorHandler.handle(error);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
        const sentinelError = new SentinelError(
            `Uncaught Exception: ${error.message}`,
            'UNCAUGHT_EXCEPTION',
            'critical',
            { originalError: error.name }
        );
        await errorHandler.handle(sentinelError);

        // Give time for logging before exiting
        setTimeout(() => process.exit(1), 1000);
    });
}

export default errorHandler;
