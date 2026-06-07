/**
 * Test suite for CLI First-Run Flow
 *
 * Verifies that the `detect` command (and its underlying projectDetector module)
 * expose the contract expected by the first-run experience and the MCP server.
 */

import { describe, it, expect } from '@jest/globals';
import { detectProjectType, getAnalyzerPreset } from '../src/analysis/projectDetector.js';

describe('CLI First-Run Flow', () => {
  it('detect command returns project info', () => {
    const result = detectProjectType(process.cwd());
    expect(result).toHaveProperty('projectType');
    expect(result).toHaveProperty('analyzers');
    expect(result).toHaveProperty('confidence');
    expect(Array.isArray(result.analyzers)).toBe(true);
  });

  it('all project types have at least securityAnalyzer', () => {
    const types = ['react', 'vue', 'node', 'python', 'go', 'rust', 'default'];
    for (const type of types) {
      const preset = getAnalyzerPreset(type);
      expect(preset).toContain('securityAnalyzer');
    }
  });
});
