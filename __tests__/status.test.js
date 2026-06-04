import { jest } from '@jest/globals';

const mockGetAuth = jest.fn();
const mockExistsSync = jest.fn();

jest.unstable_mockModule('../src/server/api/client.js', () => ({
  getAuth: mockGetAuth,
}));

jest.unstable_mockModule('node:fs', () => {
  const actual = jest.requireActual('node:fs');
  return {
    ...actual,
    default: { ...actual, existsSync: mockExistsSync },
    existsSync: mockExistsSync,
  };
});

describe('status command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
  });

  it('should show not logged in when no auth', async () => {
    mockGetAuth.mockReturnValue(null);

    const { runStatus } = await import('../src/cli/commands/status.js');

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await runStatus();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('not logged in'));
    logSpy.mockRestore();
  });

  it('should show user ID when logged in', async () => {
    mockGetAuth.mockReturnValue({ userId: 'test-user' });

    const { runStatus } = await import('../src/cli/commands/status.js');

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await runStatus();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('test-user'));
    logSpy.mockRestore();
  });
});
