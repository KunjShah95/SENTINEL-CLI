import { jest } from '@jest/globals';

const mockIsPolarConfigured = jest.fn();
const mockCheckout = jest.fn();
const mockGetErrorMessage = jest.fn();

jest.unstable_mockModule('../src/server/api/lib/polar.js', () => ({
  isPolarConfigured: mockIsPolarConfigured,
}));

jest.unstable_mockModule('../src/server/api/client.js', () => ({
  Billing: { checkout: mockCheckout },
  getErrorMessage: mockGetErrorMessage,
}));

describe('upgrade command', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should print dev mode notice when Polar not configured', async () => {
    mockIsPolarConfigured.mockReturnValue(false);

    const { runUpgrade } = await import('../src/cli/commands/upgrade.js');

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await runUpgrade();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('dev mode'));
    logSpy.mockRestore();
  });

  it('should open checkout URL when Polar is configured', async () => {
    mockIsPolarConfigured.mockReturnValue(true);
    mockCheckout.mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://checkout.polar.sh/test' }),
    });

    const { runUpgrade } = await import('../src/cli/commands/upgrade.js');

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await runUpgrade();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('https://checkout.polar.sh/test'));
    logSpy.mockRestore();
  });

  it('should show login prompt on 401', async () => {
    mockIsPolarConfigured.mockReturnValue(true);
    mockCheckout.mockResolvedValue({
      ok: false,
      status: 401,
    });

    const originalExit = process.exit;
    process.exit = jest.fn();

    const { runUpgrade } = await import('../src/cli/commands/upgrade.js');

    await runUpgrade();

    expect(process.exit).toHaveBeenCalledWith(1);

    process.exit = originalExit;
  });
});
