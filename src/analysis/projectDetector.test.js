import { describe, it, expect, vi } from '@jest/globals';
import { detectProjectType, getAnalyzerPreset } from './projectDetector.js';
import fs from 'node:fs';

vi.mock('node:fs');
