/**
 * Test suite for analyzerWorker functions
 */
import { describe, it, expect } from '@jest/globals';
import { isRegexDefinitionLine } from '../src/core/processing/workers/analyzerWorker.js';

describe('isRegexDefinitionLine', () => {
  describe('empty and whitespace-only lines', () => {
    it('should return true for empty string', () => {
      expect(isRegexDefinitionLine('')).toBe(true);
    });

    it('should return true for whitespace-only line', () => {
      expect(isRegexDefinitionLine('   ')).toBe(true);
      expect(isRegexDefinitionLine('\t')).toBe(true);
      expect(isRegexDefinitionLine('  \t  ')).toBe(true);
    });
  });

  describe('comment lines', () => {
    it('should return true for double-slash comment at start of line', () => {
      expect(isRegexDefinitionLine('// this is a comment')).toBe(true);
    });

    it('should return true for indented comment', () => {
      expect(isRegexDefinitionLine('  // indented comment')).toBe(true);
    });

    it('should return false for comment mid-line (not at start)', () => {
      expect(isRegexDefinitionLine('const x = 5; // inline comment')).toBe(false);
    });
  });

  describe('regex pattern declarations (pattern: /regex/)', () => {
    it('should return true for pattern key with regex value', () => {
      expect(isRegexDefinitionLine("pattern: /hello/g,")).toBe(true);
    });

    it('should return true for indented pattern declaration', () => {
      expect(isRegexDefinitionLine("    pattern: /[A-Z]+/i,")).toBe(true);
    });

    it('should return true for pattern with flags', () => {
      expect(isRegexDefinitionLine("pattern: /SELECT|INSERT|UPDATE/i,")).toBe(true);
    });

    it('should return true for pattern with complex regex', () => {
      expect(isRegexDefinitionLine("pattern: /(password|passwd)\\s*[:=]\\s*['\"][^'\"]{4,}['\"]/i,")).toBe(true);
    });
  });

  describe('regex assignments (= /regex/)', () => {
    it('should return true for const assignment with regex literal', () => {
      expect(isRegexDefinitionLine('const re = /pattern/gi;')).toBe(true);
    });

    it('should return true for let assignment with regex literal', () => {
      expect(isRegexDefinitionLine('let re = /[a-z]+/i;')).toBe(true);
    });

    it('should return true for var assignment with regex literal', () => {
      expect(isRegexDefinitionLine('var re = /pattern/g;')).toBe(true);
    });

    it('should return true for regex assignment with trailing comma', () => {
      expect(isRegexDefinitionLine('  re: /pattern/g,')).toBe(true);
    });

    it('should return true for regex assignment inside object with closing brace', () => {
      expect(isRegexDefinitionLine('    re: /pattern/i }')).toBe(true);
    });

    it('should return true for regex with no flags', () => {
      expect(isRegexDefinitionLine('const re = /pattern/;')).toBe(true);
    });

    it('should return true for regex with all flags', () => {
      expect(isRegexDefinitionLine('const re = /pattern/gimsuy;')).toBe(true);
    });
  });

  describe('new RegExp() constructions', () => {
    it('should return true for new RegExp with string pattern', () => {
      expect(isRegexDefinitionLine('const re = new RegExp("[A-Z]+", "g");')).toBe(true);
    });

    it('should return true for new RegExp with variable', () => {
      expect(isRegexDefinitionLine('const re = new RegExp(pattern, flags);')).toBe(true);
    });

    it('should return true for new RegExp with regex literal', () => {
      expect(isRegexDefinitionLine('const re = new RegExp(/[A-Z]+/, "g");')).toBe(true);
    });
  });

  describe('return statements with regex', () => {
    it('should return true for return with regex literal', () => {
      expect(isRegexDefinitionLine('return /pattern/g;')).toBe(true);
    });

    it('should return true for return with regex and no semicolon', () => {
      expect(isRegexDefinitionLine('return /pattern/')).toBe(true);
    });
  });

  describe('regular code lines (should NOT be skipped)', () => {
    it('should return false for if statement', () => {
      expect(isRegexDefinitionLine('if (x === 5) {')).toBe(false);
    });

    it('should return false for for loop', () => {
      expect(isRegexDefinitionLine('for (let i = 0; i < 10; i++) {')).toBe(false);
    });

    it('should return false for function declaration', () => {
      expect(isRegexDefinitionLine('function foo(bar) {')).toBe(false);
    });

    it('should return false for console.log', () => {
      expect(isRegexDefinitionLine('console.log("hello world");')).toBe(false);
    });

    it('should return false for import statement', () => {
      expect(isRegexDefinitionLine("import fs from 'fs';")).toBe(false);
    });

    it('should return false for export statement', () => {
      expect(isRegexDefinitionLine('export const x = 5;')).toBe(false);
    });

    it('should return false for variable assignment with string', () => {
      expect(isRegexDefinitionLine('const name = "foobar";')).toBe(false);
    });

    it('should return false for variable assignment with number', () => {
      expect(isRegexDefinitionLine('const count = 42;')).toBe(false);
    });

    it('should return false for arrow function', () => {
      expect(isRegexDefinitionLine('const fn = (x) => x + 1;')).toBe(false);
    });
  });

  describe('division operators (should NOT be confused with regex)', () => {
    it('should return false for simple division', () => {
      expect(isRegexDefinitionLine('const half = total / 2;')).toBe(false);
    });

    it('should return false for division in expression', () => {
      expect(isRegexDefinitionLine('const result = (a + b) / (c - d);')).toBe(false);
    });

    it('should return false for division assignment', () => {
      expect(isRegexDefinitionLine('x /= 10;')).toBe(false);
    });
  });

  describe('string literals containing regex-like patterns', () => {
    it('should return false for string with regex-like content', () => {
      expect(isRegexDefinitionLine("const msg = 'Use pattern: /[A-Z]+/i for matching';")).toBe(false);
    });

    it('should return false for string containing "new RegExp"', () => {
      expect(isRegexDefinitionLine("const doc = 'new RegExp() creates a regex';")).toBe(false);
    });

    it('should return false for comment about regex patterns', () => {
      expect(isRegexDefinitionLine('// pattern: /foo/ is a regex')).toBe(false);
    });
  });
});
