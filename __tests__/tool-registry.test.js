import { ToolRegistry, createDefaultRegistry, PHASES } from '../src/agents/tool-registry.js';
import { FileReader } from '../src/git/file-reader.js';

describe('ToolRegistry', () => {
  test('creates empty registry and registers tools', () => {
    const registry = new ToolRegistry();
    registry.register('test_tool', async () => 'ok', {
      description: 'A test tool',
      inputSchema: { type: 'object' },
      availableIn: [PHASES.MAIN],
    });
    expect(registry.getRegisteredNames()).toEqual(['test_tool']);
  });

  test('prevents duplicate registration', () => {
    const registry = new ToolRegistry();
    registry.register('dup', async () => {});
    expect(() => registry.register('dup', async () => {})).toThrow('already registered');
  });

  test('freeze prevents further registration', () => {
    const registry = new ToolRegistry();
    registry.freeze();
    expect(() => registry.register('late', async () => {})).toThrow('frozen');
    expect(registry.isFrozen()).toBe(true);
  });

  test('getToolsForPhase returns only available tools', () => {
    const registry = new ToolRegistry();
    registry.register('plan_only', async () => {}, { availableIn: [PHASES.PLAN] });
    registry.register('main_only', async () => {}, { availableIn: [PHASES.MAIN] });
    registry.register('both', async () => {}, { availableIn: [PHASES.PLAN, PHASES.MAIN] });

    expect(registry.getToolsForPhase(PHASES.PLAN).map(t => t.name)).toEqual(['plan_only', 'both']);
    expect(registry.getToolsForPhase(PHASES.MAIN).map(t => t.name)).toEqual(['main_only', 'both']);
    expect(registry.getToolsForPhase(PHASES.FILTER)).toEqual([]);
  });

  test('execute calls the registered implementation', async () => {
    const registry = new ToolRegistry();
    registry.register('echo', async (args) => args.msg, {
      availableIn: [PHASES.MAIN],
    });
    const result = await registry.execute('echo', { msg: 'hello' }, { phase: PHASES.MAIN });
    expect(result).toBe('hello');
  });

  test('execute throws for unknown tool', async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute('nope', {})).rejects.toThrow('Unknown tool');
  });

  test('execute throws for wrong phase', async () => {
    const registry = new ToolRegistry();
    registry.register('plan_only', async () => {}, { availableIn: [PHASES.PLAN] });
    await expect(registry.execute('plan_only', {}, { phase: PHASES.MAIN })).rejects.toThrow('not available');
  });

  test('createDefaultRegistry provides all expected tools', () => {
    const registry = createDefaultRegistry();
    const names = registry.getRegisteredNames();
    expect(names).toContain('read_file');
    expect(names).toContain('search_code');
    expect(names).toContain('find_files');
    expect(names).toContain('read_diff');
    expect(names).toContain('submit_comment');
    expect(names).toContain('task_done');
  });

  test('default registry has freeze already applied', () => {
    const registry = createDefaultRegistry();
    expect(registry.isFrozen()).toBe(true);
  });

  test('reset resets call counts', async () => {
    const registry = new ToolRegistry();
    registry.register('counter', async () => {}, { availableIn: [PHASES.MAIN] });
    await registry.execute('counter', {}, { phase: PHASES.MAIN });
    expect(registry.getStats().counter.callCount).toBe(1);
    registry.reset();
    expect(registry.getStats().counter.callCount).toBe(0);
  });

  test('getStats returns call stats for all tools', () => {
    const registry = createDefaultRegistry();
    const stats = registry.getStats();
    expect(stats.read_file).toBeDefined();
    expect(stats.read_file.availableIn).toEqual([PHASES.PLAN, PHASES.MAIN]);
  });
});

describe('FileReader', () => {
  test('exists returns true for existing files', async () => {
    const reader = new FileReader();
    const result = await reader.exists('package.json');
    expect(result).toBe(true);
  });

  test('exists returns false for missing files', async () => {
    const reader = new FileReader();
    const result = await reader.exists('does-not-exist-foo-bar.txt');
    expect(result).toBe(false);
  });

  test('read reads file contents', async () => {
    const reader = new FileReader();
    const content = await reader.read('package.json');
    expect(content).toContain('"name"');
    expect(content).toContain('"sentinel-cli"');
  });

  test('readLines returns specified range', async () => {
    const reader = new FileReader();
    const content = await reader.readLines('package.json', 1, 3);
    const lines = content.split('\n');
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  test('readWindow returns window around target line', async () => {
    const reader = new FileReader();
    const result = await reader.readWindow('package.json', 3, 1);
    expect(result.startLine).toBe(2);
    expect(result.endLine).toBe(4);
    expect(result.content).toBeTruthy();
  });
});
