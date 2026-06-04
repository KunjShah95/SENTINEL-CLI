import { jest } from '@jest/globals';

const mockExistsSync = jest.fn();
const mockUnlinkSync = jest.fn();

jest.unstable_mockModule('node:fs', () => {
  const actual = jest.requireActual('node:fs');
  return {
    ...actual,
    default: { ...actual, existsSync: mockExistsSync, unlinkSync: mockUnlinkSync },
    existsSync: mockExistsSync,
    unlinkSync: mockUnlinkSync,
  };
});

describe('clear command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should clear session cache and log success', async () => {
    mockExistsSync.mockReturnValue(true);

    const { runClear } = await import('../src/cli/commands/clear.js');

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    runClear();

    expect(mockUnlinkSync).toHaveBeenCalled();
    expect(logSpy.mock.calls[0][0]).toContain('Cleared');
    logSpy.mockRestore();
  });

  it('should log when cache is already empty', async () => {
    mockExistsSync.mockReturnValue(false);

    const { runClear } = await import('../src/cli/commands/clear.js');

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    runClear();

    expect(logSpy.mock.calls[0][0]).toContain('already empty');
    logSpy.mockRestore();
  });
});
