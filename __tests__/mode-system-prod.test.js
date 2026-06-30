/**
 * Tests for Mode System — BUILD, PLAN, REVIEW, SCAN, FIX modes.
 */

describe('Mode System', () => {
  let ModeEnum, isModeFn, isReadOnlyToolFn, isToolAllowedInModeFn, getModeLabelFn, getModeDescriptionFn;

  beforeAll(async () => {
    const mod = await import('../src/shared/schemas/mode.js');
    ModeEnum = mod.Mode;
    isModeFn = mod.isMode;
    isReadOnlyToolFn = mod.isReadOnlyTool;
    isToolAllowedInModeFn = mod.isToolAllowedInMode;
    getModeLabelFn = mod.getModeLabel;
    getModeDescriptionFn = mod.getModeDescription;
  });

  test('Mode has all 5 modes', () => {
    expect(ModeEnum.BUILD).toBe('BUILD');
    expect(ModeEnum.PLAN).toBe('PLAN');
    expect(ModeEnum.REVIEW).toBe('REVIEW');
    expect(ModeEnum.SCAN).toBe('SCAN');
    expect(ModeEnum.FIX).toBe('FIX');
  });

  test('isMode validates all modes', () => {
    expect(isModeFn('BUILD')).toBe(true);
    expect(isModeFn('PLAN')).toBe(true);
    expect(isModeFn('REVIEW')).toBe(true);
    expect(isModeFn('SCAN')).toBe(true);
    expect(isModeFn('FIX')).toBe(true);
    expect(isModeFn('INVALID')).toBe(false);
  });

  test('isReadOnlyTool identifies read tools', () => {
    expect(isReadOnlyToolFn('readFile')).toBe(true);
    expect(isReadOnlyToolFn('glob')).toBe(true);
    expect(isReadOnlyToolFn('grep')).toBe(true);
    expect(isReadOnlyToolFn('writeFile')).toBe(false);
    expect(isReadOnlyToolFn('bash')).toBe(false);
  });

  test('BUILD mode allows all tools', () => {
    expect(isToolAllowedInModeFn('readFile', 'BUILD')).toBe(true);
    expect(isToolAllowedInModeFn('writeFile', 'BUILD')).toBe(true);
    expect(isToolAllowedInModeFn('bash', 'BUILD')).toBe(true);
  });

  test('PLAN mode blocks write tools', () => {
    expect(isToolAllowedInModeFn('readFile', 'PLAN')).toBe(true);
    expect(isToolAllowedInModeFn('diffFile', 'PLAN')).toBe(true);
    expect(isToolAllowedInModeFn('writeFile', 'PLAN')).toBe(false);
    expect(isToolAllowedInModeFn('bash', 'PLAN')).toBe(false);
  });

  test('SCAN mode blocks write tools', () => {
    expect(isToolAllowedInModeFn('readFile', 'SCAN')).toBe(true);
    expect(isToolAllowedInModeFn('writeFile', 'SCAN')).toBe(false);
  });

  test('FIX mode allows read+write but blocks shell', () => {
    expect(isToolAllowedInModeFn('readFile', 'FIX')).toBe(true);
    expect(isToolAllowedInModeFn('writeFile', 'FIX')).toBe(true);
    expect(isToolAllowedInModeFn('bash', 'FIX')).toBe(false);
  });

  test('getModeLabel returns correct labels', () => {
    expect(getModeLabelFn('BUILD')).toBe('Build');
    expect(getModeLabelFn('PLAN')).toBe('Plan');
    expect(getModeLabelFn('SCAN')).toBe('Scan');
    expect(getModeLabelFn('FIX')).toBe('Fix');
  });

  test('getModeDescription returns descriptions', () => {
    expect(getModeDescriptionFn('BUILD')).toContain('build');
    expect(getModeDescriptionFn('PLAN')).toContain('Read-only');
    expect(getModeDescriptionFn('FIX')).toContain('fix');
  });
});
