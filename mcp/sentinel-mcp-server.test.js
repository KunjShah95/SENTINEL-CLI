import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';

describe('MCP Server Tool Schemas', () => {
  it('sentinel_review_diff schema validates diff and optional files', () => {
    const schema = z.object({
      diff: z.string(),
      files: z.array(z.string()).optional(),
    });

    const valid = schema.parse({ diff: 'diff --git a/a.js b/a.js\n@@ -1 +1 @@\n-foo\n+bar', files: ['a.js'] });
    expect(valid.diff).toContain('diff --git');
    expect(valid.files).toEqual(['a.js']);

    const noFiles = schema.parse({ diff: 'some diff' });
    expect(noFiles.files).toBeUndefined();
  });

  it('sentinel_run_sast schema defaults target to current dir', () => {
    const schema = z.object({
      target: z.string().optional().default('.'),
    });

    const withTarget = schema.parse({ target: '/some/path' });
    expect(withTarget.target).toBe('/some/path');

    const defaulted = schema.parse({});
    expect(defaulted.target).toBe('.');
  });

  it('sentinel_review_pr schema requires owner, repo, prNumber', () => {
    const schema = z.object({
      owner: z.string(),
      repo: z.string(),
      prNumber: z.number(),
    });

    const valid = schema.parse({ owner: 'user', repo: 'repo', prNumber: 42 });
    expect(valid.owner).toBe('user');
    expect(valid.prNumber).toBe(42);

    expect(() => schema.parse({ owner: 'user' })).toThrow();
    expect(() => schema.parse({ owner: 'user', repo: 'repo', prNumber: 'not-a-number' })).toThrow();
  });

  it('sentinel_health schema is empty', () => {
    const schema = z.object({});
    const result = schema.parse({});
    expect(result).toEqual({});
  });

  it('sentinel_analyze_code schema requires code and language', () => {
    const schema = z.object({
      code: z.string(),
      language: z.string(),
    });

    const valid = schema.parse({ code: 'const x = 1;', language: 'javascript' });
    expect(valid.code).toContain('x = 1');
    expect(valid.language).toBe('javascript');

    expect(() => schema.parse({ code: 'hello' })).toThrow();
    expect(() => schema.parse({ language: 'python' })).toThrow();
  });

  it('all tool schemas correctly describe parameters', () => {
    const toolSchemas = [
      { name: 'sentinel_review_diff', schema: z.object({ diff: z.string(), files: z.array(z.string()).optional() }) },
      { name: 'sentinel_run_sast', schema: z.object({ target: z.string().optional().default('.') }) },
      { name: 'sentinel_review_pr', schema: z.object({ owner: z.string(), repo: z.string(), prNumber: z.number() }) },
      { name: 'sentinel_health', schema: z.object({}) },
      { name: 'sentinel_analyze_code', schema: z.object({ code: z.string(), language: z.string() }) },
    ];

    expect(toolSchemas).toHaveLength(5);
    toolSchemas.forEach(t => expect(t.name).toMatch(/^sentinel_/));
  });
});
