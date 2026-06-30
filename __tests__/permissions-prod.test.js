/**
 * Tests for Permission System — tool policies, categories, validation.
 */

describe('Permission System', () => {
  let getToolPolicy, checkPermission, getToolCategory, listToolPermissions,
    validatePermissionsConfig, TOOL_CATEGORIES;

  beforeAll(async () => {
    const mod = await import('../src/shared/tools/permissions.js');
    getToolPolicy = mod.getToolPolicy;
    checkPermission = mod.checkPermission;
    getToolCategory = mod.getToolCategory;
    listToolPermissions = mod.listToolPermissions;
    validatePermissionsConfig = mod.validatePermissionsConfig;
    TOOL_CATEGORIES = mod.TOOL_CATEGORIES;
  });

  test('TOOL_CATEGORIES maps all known tools', () => {
    expect(TOOL_CATEGORIES.readFile).toBe('read');
    expect(TOOL_CATEGORIES.writeFile).toBe('write');
    expect(TOOL_CATEGORIES.bash).toBe('shell');
    expect(TOOL_CATEGORIES.searchWeb).toBe('network');
    expect(TOOL_CATEGORIES.undoLastChange).toBe('undo');
  });

  test('getToolPolicy returns default policy for known tools', () => {
    expect(getToolPolicy('readFile')).toBe('allow');
    expect(getToolPolicy('bash')).toBe('ask');
    expect(getToolPolicy('writeFile')).toBe('allow');
  });

  test('getToolPolicy returns ask for unknown tools', () => {
    expect(getToolPolicy('unknownTool')).toBe('ask');
  });

  test('checkPermission returns allowed for read tools', () => {
    const result = checkPermission('readFile');
    expect(result.allowed).toBe(true);
    expect(result.policy).toBe('allow');
  });

  test('checkPermission returns allowed=true with message for ask tools', () => {
    const result = checkPermission('bash');
    expect(result.allowed).toBe(true);
    expect(result.policy).toBe('ask');
    expect(result.message).toBeDefined();
  });

  test('getToolCategory returns correct category', () => {
    expect(getToolCategory('readFile')).toBe('read');
    expect(getToolCategory('bash')).toBe('shell');
    expect(getToolCategory('unknownTool')).toBe('unknown');
  });

  test('listToolPermissions returns all tools with policies', () => {
    const list = listToolPermissions();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
    for (const item of list) {
      expect(item.tool).toBeDefined();
      expect(item.category).toBeDefined();
      expect(item.policy).toBeDefined();
      expect(['allow', 'deny', 'ask']).toContain(item.policy);
    }
  });

  test('validatePermissionsConfig accepts valid config', () => {
    const result = validatePermissionsConfig({
      tools: { bash: 'deny', writeFile: 'allow' },
      defaults: { read: 'allow', write: 'ask' }
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('validatePermissionsConfig rejects invalid tool policy', () => {
    const result = validatePermissionsConfig({
      tools: { bash: 'maybe' }
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('validatePermissionsConfig rejects invalid category', () => {
    const result = validatePermissionsConfig({
      defaults: { invalidCategory: 'allow' }
    });
    expect(result.valid).toBe(false);
  });

  test('validatePermissionsConfig rejects non-object tools', () => {
    const result = validatePermissionsConfig({ tools: 'not an object' });
    expect(result.valid).toBe(false);
  });
});
