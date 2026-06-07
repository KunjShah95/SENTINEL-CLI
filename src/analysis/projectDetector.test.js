import { describe, it, expect, vi } from '@jest/globals';
import { detectProjectType, getAnalyzerPreset } from './projectDetector.js';
import fs from 'node:fs';

vi.mock('node:fs');

describe('projectDetector', () => {
  describe('detectProjectType', () => {
    it('detects default project type for unknown directory', () => {
      fs.readdirSync.mockReturnValue([]);
      expect(detectProjectType('/fake/path')).toBe('default');
    });

    it('detects node project when package.json exists', () => {
      fs.readdirSync.mockReturnValue(['package.json']);
      fs.readFileSync.mockReturnValue('{}');
      expect(detectProjectType('/fake/path')).toBe('node');
    });
  });
});
