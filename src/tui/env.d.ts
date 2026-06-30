declare module "../../core/bot.js" {
  export class CodeReviewBot {
    initialize(): Promise<void>;
    analyzeFiles(files: string[], options?: Record<string, unknown>): Promise<unknown>;
    shutdown(): Promise<void>;
  }
}

declare module "../../core/index.js" {
  export class AutoFixGenerator {
    generateFixes(issues: unknown[]): Promise<unknown>;
  }
}

declare module "../../cli/sentinelConsole.js" {
  export function runSentinelConsole(options: { prompt: string; quiet?: boolean }): Promise<unknown>;
}

declare module "../../config/configManager.js" {
  export const configManager: {
    load(): Promise<void>;
    configPath?: string;
    isProviderEnabled(id: string): boolean;
    getApiKey(id: string): string | null;
    setApiKey(providerId: string, key: string): Promise<string>;
    getConfiguredProviders(): string[];
    injectEnvVars(): void;
    save(): Promise<void>;
    config?: { providers?: Record<string, { apiKey?: string }> };
  };
}