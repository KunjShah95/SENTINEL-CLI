/**
 * Test suite for Error Handler
 */
import {
    SentinelError,
    SecurityError,
    ValidationError,
    ConfigurationError,
    AnalyzerError,
    errorHandler
} from '../src/utils/errorHandler.js';

describe('SentinelError', () => {
    it('should create error with all properties', () => {
        const error = new SentinelError(
            'Test error',
            'TEST_ERROR',
            'high',
            { foo: 'bar' }
        );

        expect(error.message).toBe('Test error');
        expect(error.code).toBe('TEST_ERROR');
        expect(error.severity).toBe('high');
        expect(error.context).toEqual({ foo: 'bar' });
        expect(error.timestamp).toBeDefined();
        expect(error.name).toBe('SentinelError');
    });

    it('should have proper JSON representation', () => {
        const error = new SentinelError('Test', 'TEST', 'medium', { key: 'value' });
        const json = error.toJSON();

        expect(json).toHaveProperty('name');
        expect(json).toHaveProperty('message');
        expect(json).toHaveProperty('code');
        expect(json).toHaveProperty('severity');
        expect(json).toHaveProperty('context');
        expect(json).toHaveProperty('timestamp');
        expect(json).toHaveProperty('stack');
    });
});

describe('Specialized Error Classes', () => {
    it('should create SecurityError with critical severity', () => {
        const error = new SecurityError('Security issue', { file: 'test.js' });

        expect(error.name).toBe('SecurityError');
        expect(error.code).toBe('SECURITY_ERROR');
        expect(error.severity).toBe('critical');
        expect(error.context).toEqual({ file: 'test.js' });
    });

    it('should create ValidationError with low severity', () => {
        const error = new ValidationError('Invalid input', { field: 'email' });

        expect(error.name).toBe('ValidationError');
        expect(error.code).toBe('VALIDATION_ERROR');
        expect(error.severity).toBe('low');
    });

    it('should create ConfigurationError with high severity', () => {
        const error = new ConfigurationError('Bad config', { setting: 'apiKey' });

        expect(error.name).toBe('ConfigurationError');
        expect(error.code).toBe('CONFIG_ERROR');
        expect(error.severity).toBe('high');
    });

    it('should create AnalyzerError with analyzer context', () => {
        const error = new AnalyzerError('Analysis failed', 'SecurityAnalyzer', { file: 'test.js' });

        expect(error.name).toBe('AnalyzerError');
        expect(error.code).toBe('ANALYZER_ERROR');
        expect(error.severity).toBe('medium');
        expect(error.context.analyzer).toBe('SecurityAnalyzer');
    });
});

describe('ErrorHandler', () => {
    beforeEach(() => {
        errorHandler.handlers = [];
        errorHandler.monitoringEnabled = false;
    });

    it('should register custom handlers', () => {
        const handler = jest.fn();
        errorHandler.registerHandler(handler);

        expect(errorHandler.handlers).toContain(handler);
    });

    it('should execute custom handlers on error', async () => {
        const handler = jest.fn();
        errorHandler.registerHandler(handler);

        const error = new SentinelError('Test', 'TEST', 'medium');
        await errorHandler.handle(error);

        expect(handler).toHaveBeenCalledWith(
            error,
            expect.objectContaining({
                message: 'Test',
                code: 'TEST',
                severity: 'medium'
            })
        );
    });

    it('should convert regular errors to SentinelError', async () => {
        const regularError = new Error('Regular error');
        const result = await errorHandler.handle(regularError);

        expect(result.code).toBe('UNKNOWN_ERROR');
        expect(result.severity).toBe('medium');
        expect(result.message).toBe('Regular error');
    });

    it('should wrap async functions with error handling', async () => {
        const throwingFn = async () => {
            throw new Error('Test error');
        };

        const wrapped = errorHandler.wrapAsync(throwingFn);

        await expect(wrapped()).rejects.toThrow('Test error');
    });

    it('should provide tryExecute with fallback', async () => {
        const throwingFn = async () => {
            throw new Error('Test error');
        };

        const result = await errorHandler.tryExecute(throwingFn, 'fallback');

        expect(result).toBe('fallback');
    });

    it('should return result when no error occurs', async () => {
        const successFn = async () => 'success';

        const result = await errorHandler.tryExecute(successFn, 'fallback');

        expect(result).toBe('success');
    });
});
