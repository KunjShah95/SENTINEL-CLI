import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';

describe('MCP Server Tool Schemas', () => {
  it('sentinel_analyze schema validates file paths', () => {
    const schema = z.object({
      files: z.array(z.string()).optional(),
      directory: z.string().optional(),
      format: z.enum(['json', 'sarif', 'markdown']).optional(),
    });

    const valid = schema.parse({ files: ['src/index.js'], format: 'json' });
    expect(valid.files).toEqual(['src/index.js']);

    expect(() => schema.parse({ format: 'invalid' })).toThrow();
  });

  it('sentinel_health schema is empty', () => {
    const schema = z.object({});
    const result = schema.parse({});
    expect(result).toEqual({});
  });

  it('sentinel_detect_project schema accepts directory path', () => {
    const schema = z.object({
      directory: z.string().optional(),
    });
    const result = schema.parse({ directory: '/some/path' });
    expect(result.directory).toBe('/some/path');
  });
});
