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
