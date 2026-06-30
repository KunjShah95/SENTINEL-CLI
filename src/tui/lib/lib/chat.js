import { Config } from '../../config/config.js';
import { configManager } from '../../config/configManager.js';
import LLMOrchestrator from '../../llm/llmOrchestrator.js';
function getOllamaHost() {
  return process.env.OLLAMA_HOST || configManager.getApiKey('ollama') || 'http://localhost:11434';
}
export async function getOllamaModels() {
  try {
    const host = getOllamaHost();
    const res = await fetch(`${host}/api/tags`);
    if (!res.ok)
      return [];
    const data = await res.json();
    if (!data?.models || !Array.isArray(data.models))
      return [];
    return data.models.map((m) => ({
      name: m.name,
      size: m.size || 0,
      modified: m.modified_at || '',
    }));
  }
  catch {
    return [];
  }
}
let orchestratorInstance = null;
async function getOrchestrator() {
  if (orchestratorInstance)
    return orchestratorInstance;
  const config = new Config();
  await config.load();
  await configManager.load();
  configManager.injectEnvVars();
  const defaultProviders = config.get('ai.providers', []);
  const mergedProviders = defaultProviders
    .map((p) => {
      const envKey = p.apiKeyEnv || '';
      const stored = configManager.getApiKey(p.provider);
      return {
        ...p,
        apiKey: stored || process.env[envKey] || '',
      };
    })
    .filter((p) => p.enabled && (p.provider === 'local' || p.apiKey));
  orchestratorInstance = new LLMOrchestrator({
    providers: mergedProviders,
    temperature: config.get('ai.temperature', 0.3),
    maxTokens: config.get('ai.maxTokens', 2000),
  });
  return orchestratorInstance;
}
export async function chat(prompt, options = {}) {
  const orchestrator = await getOrchestrator();
  const result = await orchestrator.chat(prompt, options);
  return result.text;
}
export async function getProviderInfo() {
  const config = new Config();
  await config.load();
  await configManager.load();
  const providers = config.get('ai.providers', []);
  const ollamaModels = await getOllamaModels();
  return providers.map((p) => {
    const storedKey = configManager.getApiKey(p.provider);
    const envKey = p.apiKeyEnv || '';
    const hasKey = !!(storedKey || process.env[envKey]);
    let model = p.model || 'unknown';
    if (p.provider === 'ollama' && ollamaModels.length > 0) {
      model = ollamaModels.map((m) => m.name).join(', ');
    }
    return {
      id: p.id,
      provider: p.provider,
      model,
      enabled: p.enabled !== false,
      hasKey,
    };
  });
}
