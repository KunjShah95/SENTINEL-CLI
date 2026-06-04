import { jest } from '@jest/globals';

const mockGetAuth = jest.fn();

jest.unstable_mockModule('../src/server/api/client.js', () => ({
  getAuth: mockGetAuth,
}));

describe('whoami command', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should print user ID when logged in', async () => {
    mockGetAuth.mockReturnValue({ userId: 'test-user' });

    const { runWhoami } = await import('../src/cli/commands/whoami.js');
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    runWhoami();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('test-user'));
    logSpy.mockRestore();
  });

  it('should exit with error when not logged in', async () => {
    mockGetAuth.mockReturnValue(null);

    const originalExit = process.exit;
    process.exit = jest.fn();

    const { runWhoami } = await import('../src/cli/commands/whoami.js');

    runWhoami();

    expect(process.exit).toHaveBeenCalledWith(1);

    process.exit = originalExit;
  });
});
