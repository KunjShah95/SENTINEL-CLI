import { promises as fs } from 'fs';
import os from 'os';
import { join } from 'path';
import { ComplianceScanner } from '../src/compliance/complianceScanner.js';

describe('ComplianceScanner', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(join(os.tmpdir(), 'sentinel-compliance-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('throws on unknown compliance standard', async () => {
    const scanner = new ComplianceScanner(tempDir);

    await expect(scanner.scanCompliance('UNKNOWN-STANDARD')).rejects.toThrow('Unknown standard');
  });

  test('returns structured compliance report for OWASP', async () => {
    const filePath = join(tempDir, 'app.js');
    await fs.writeFile(
      filePath,
      `
      const crypto = require('crypto');
      const password = "myHardcodedPassword123";
      app.get('/users', (req, res) => {
        eval(req.query.code);
        res.send('ok');
      });
      `,
      'utf8'
    );

    const scanner = new ComplianceScanner(tempDir);
    const report = await scanner.scanCompliance('OWASP-Top-10');

    expect(report.standard).toBe('OWASP-Top-10');
    expect(typeof report.timestamp).toBe('string');
    expect(Array.isArray(report.checks)).toBe(true);
    expect(report.checks.length).toBeGreaterThan(0);
    expect(typeof report.passed).toBe('number');
    expect(typeof report.failed).toBe('number');
    expect(typeof report.warnings).toBe('number');
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
  });

  test('supports additional standards (PCI-DSS, HIPAA)', async () => {
    const scanner = new ComplianceScanner(tempDir);

    const pci = await scanner.scanCompliance('PCI-DSS');
    const hipaa = await scanner.scanCompliance('HIPAA');

    expect(pci.standard).toBe('PCI-DSS');
    expect(Array.isArray(pci.checks)).toBe(true);
    expect(hipaa.standard).toBe('HIPAA');
    expect(Array.isArray(hipaa.checks)).toBe(true);
  });
});
