import { jest } from '@jest/globals';

const mockDevLogin = jest.fn();
const mockSaveAuth = jest.fn();
const mockGetErrorMessage = jest.fn();
const mockIssueDevToken = jest.fn();

jest.unstable_mockModule('../src/server/api/client.js', () => ({
  Auth: { devLogin: mockDevLogin },
  saveAuth: mockSaveAuth,
  getErrorMessage: mockGetErrorMessage,
}));

jest.unstable_mockModule('../src/server/api/middleware/auth.js', () => ({
  issueDevToken: mockIssueDevToken,
}));

describe('login command', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.SENTINEL_USER_ID;
  });

  it('should login via server when reachable', async () => {
    mockDevLogin.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'server-token', userId: 'user-1' }),
    });

    const { runLogin } = await import('../src/cli/commands/login.js');
    await runLogin({ userId: 'test-user' });

    expect(mockDevLogin).toHaveBeenCalledWith('test-user');
    expect(mockSaveAuth).toHaveBeenCalledWith({ token: 'server-token', userId: 'user-1' });
  });

  it('should fall back to local dev token on connection error', async () => {
    const connError = new Error('fetch failed');
    connError.cause = { code: 'ECONNREFUSED' };
    mockDevLogin.mockRejectedValue(connError);
    mockIssueDevToken.mockReturnValue('local-dev-token');

    const originalExit = process.exit;
    process.exit = jest.fn();

    const { runLogin } = await import('../src/cli/commands/login.js');
    await runLogin({ userId: 'local-user' });

    expect(mockIssueDevToken).toHaveBeenCalledWith('local-user');
    expect(mockSaveAuth).toHaveBeenCalledWith({ token: 'local-dev-token', userId: 'local-user' });

    process.exit = originalExit;
  });

  it('should use SENTINEL_USER_ID env var as default', async () => {
    process.env.SENTINEL_USER_ID = 'env-user';
    mockDevLogin.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'env-token', userId: 'env-user' }),
    });

    const { runLogin } = await import('../src/cli/commands/login.js');
    await runLogin();

    expect(mockDevLogin).toHaveBeenCalledWith('env-user');
  });
});
