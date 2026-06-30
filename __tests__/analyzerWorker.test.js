/**
 * Test suite for analyzerWorker — isRegexDefinitionLine helper.
 *
 * Run with:
 *   node --test __tests__/analyzerWorker.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isRegexDefinitionLine } from '../src/core/processing/workers/analyzerWorker.js';

describe('isRegexDefinitionLine', () => {
  describe('empty and whitespace-only lines', () => {
    test('should return true for empty string', () => {
      assert.equal(isRegexDefinitionLine(''), true);
    });

    test('should return true for whitespace-only line', () => {
      assert.equal(isRegexDefinitionLine('   '), true);
      assert.equal(isRegexDefinitionLine('\t'), true);
      assert.equal(isRegexDefinitionLine('  \t  '), true);
    });
  });

  describe('comment lines', () => {
    test('should return true for double-slash comment at start of line', () => {
      assert.equal(isRegexDefinitionLine('// this is a comment'), true);
    });

    test('should return true for indented comment', () => {
      assert.equal(isRegexDefinitionLine('  // indented comment'), true);
    });

    test('should return false for comment mid-line (not at start)', () => {
      assert.equal(isRegexDefinitionLine('const x = 5; // inline comment'), false);
    });
  });

  describe('regex pattern declarations (pattern: /regex/)', () => {
    test('should return true for pattern key with regex value', () => {
      assert.equal(isRegexDefinitionLine('pattern: /hello/g,'), true);
    });

    test('should return true for indented pattern declaration', () => {
      assert.equal(isRegexDefinitionLine('    pattern: /[A-Z]+/i,'), true);
    });

    test('should return true for pattern with flags', () => {
      assert.equal(isRegexDefinitionLine('pattern: /SELECT|INSERT|UPDATE/i,'), true);
    });

    test('should return true for pattern with complex regex', () => {
      assert.equal(isRegexDefinitionLine("pattern: /(password|passwd)\\s*[:=]\\s*['\"][^'\"]{4,}['\"]/i,"), true);
    });
  });

  describe('regex assignments (= /regex/)', () => {
    test('should return true for const assignment with regex literal', () => {
      assert.equal(isRegexDefinitionLine('const re = /pattern/gi;'), true);
    });

    test('should return true for let assignment with regex literal', () => {
      assert.equal(isRegexDefinitionLine('let re = /[a-z]+/i;'), true);
    });

    test('should return true for var assignment with regex literal', () => {
      assert.equal(isRegexDefinitionLine('var re = /pattern/g;'), true);
    });

    test('should return true for regex assignment with trailing comma', () => {
      assert.equal(isRegexDefinitionLine('  re: /pattern/g,'), true);
    });

    test('should return true for regex assignment inside object with closing brace', () => {
      assert.equal(isRegexDefinitionLine('    re: /pattern/i }'), true);
    });

    test('should return true for regex with no flags', () => {
      assert.equal(isRegexDefinitionLine('const re = /pattern/;'), true);
    });

    test('should return true for regex with all flags', () => {
      assert.equal(isRegexDefinitionLine('const re = /pattern/gimsuy;'), true);
    });
  });

  describe('new RegExp() constructions', () => {
    test('should return true for new RegExp with string pattern', () => {
      assert.equal(isRegexDefinitionLine('const re = new RegExp("[A-Z]+", "g");'), true);
    });

    test('should return true for new RegExp with variable', () => {
      assert.equal(isRegexDefinitionLine('const re = new RegExp(pattern, flags);'), true);
    });

    test('should return true for new RegExp with regex literal', () => {
      assert.equal(isRegexDefinitionLine('const re = new RegExp(/[A-Z]+/, "g");'), true);
    });
  });

  describe('return statements with regex', () => {
    test('should return true for return with regex literal', () => {
      assert.equal(isRegexDefinitionLine('return /pattern/g;'), true);
    });

    test('should return true for return with regex and no semicolon', () => {
      assert.equal(isRegexDefinitionLine('return /pattern/'), true);
    });
  });

  describe('regular code lines (should NOT be skipped)', () => {
    test('should return false for if statement', () => {
      assert.equal(isRegexDefinitionLine('if (x === 5) {'), false);
    });

    test('should return false for for loop', () => {
      assert.equal(isRegexDefinitionLine('for (let i = 0; i < 10; i++) {'), false);
    });

    test('should return false for function declaration', () => {
      assert.equal(isRegexDefinitionLine('function foo(bar) {'), false);
    });

    test('should return false for console.log', () => {
      assert.equal(isRegexDefinitionLine('console.log("hello world");'), false);
    });

    test('should return false for import statement', () => {
      assert.equal(isRegexDefinitionLine("import fs from 'fs';"), false);
    });

    test('should return false for export statement', () => {
      assert.equal(isRegexDefinitionLine('export const x = 5;'), false);
    });

    test('should return false for variable assignment with string', () => {
      assert.equal(isRegexDefinitionLine('const name = "foobar";'), false);
    });

    test('should return false for variable assignment with number', () => {
      assert.equal(isRegexDefinitionLine('const count = 42;'), false);
    });

    test('should return false for arrow function', () => {
      assert.equal(isRegexDefinitionLine('const fn = (x) => x + 1;'), false);
    });
  });

  describe('division operators (should NOT be confused with regex)', () => {
    test('should return false for simple division', () => {
      assert.equal(isRegexDefinitionLine('const half = total / 2;'), false);
    });

    test('should return false for division in expression', () => {
      assert.equal(isRegexDefinitionLine('const result = (a + b) / (c - d);'), false);
    });

    test('should return false for division assignment', () => {
      assert.equal(isRegexDefinitionLine('x /= 10;'), false);
    });
  });

  describe('string literals containing regex-like patterns', () => {
    test('should return true for string with pattern: / syntax (heuristic)', () => {
      // The function is a heuristic — it detects "pattern: /" anywhere in the line
      assert.equal(isRegexDefinitionLine("const msg = 'Use pattern: /[A-Z]+/i for matching';"), true);
    });

    test('should return true for string with new RegExp( (heuristic)', () => {
      // The function is a heuristic — it detects "new RegExp(" anywhere in the line
      assert.equal(isRegexDefinitionLine("const doc = 'new RegExp() creates a regex';"), true);
    });

    test('should return true for comment about regex patterns', () => {
      // Lines starting with // are comments and are always skipped
      assert.equal(isRegexDefinitionLine('// pattern: /foo/ is a regex'), true);
    });
  });
});
