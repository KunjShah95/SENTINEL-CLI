/**
 * Model Router — smart model selection based on task type.
 *
 * Inspired by how tools like CodeRabbit and Claude Code dispatch different
 * models for different tasks (reasoning-heavy vs. cheap-and-fast). The router
 * uses a static preference table and the user's currently selected model as a
 * fallback, keeping it entirely stateless and free of network calls.
 */
const ROUTING_TABLE = {
  'security-review': {
    tier1: 'deepseek-reasoner',
    tier2: 'llama-3.3-70b-versatile',
    tier3: 'grok-3',
    reason: 'strong reasoning for security analysis',
    maxTokens: 8192,
    temperature: 0.1,
  },
  'fix-code': {
    tier1: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    tier2: 'codestral-latest',
    tier3: 'llama-3.3-70b-versatile',
    reason: 'open-source code generation',
    maxTokens: 8192,
    temperature: 0.2,
  },
  'plan': {
    tier1: 'deepseek-reasoner',
    tier2: 'qwen-qwq-32b',
    tier3: 'llama-3.3-70b-versatile',
    reason: 'deep reasoning for architecture',
    maxTokens: 4096,
    temperature: 0.3,
  },
  'ci-fix': {
    tier1: 'codestral-latest',
    tier2: 'llama-3.3-70b-versatile',
    tier3: 'deepseek-chat',
    reason: 'good model for test-failure analysis',
    maxTokens: 4096,
    temperature: 0.15,
  },
  'quick-scan': {
    tier1: 'llama-3.1-8b-instant',
    tier2: 'gemma2-9b-it',
    tier3: 'mistral-small-latest',
    reason: 'fast and cost-efficient for quick scans',
    maxTokens: 2048,
    temperature: 0.0,
  },
  'explain': {
    tier1: 'llama-3.1-8b-instant',
    tier2: 'mistral-small-latest',
    tier3: 'gemma2-9b-it',
    reason: 'any capable model for explanations',
    maxTokens: 2048,
    temperature: 0.4,
  },
  'summarize': {
    tier1: 'llama-3.1-8b-instant',
    tier2: 'gemma2-9b-it',
    tier3: 'mistral-small-latest',
    reason: 'lightweight model sufficient for summaries',
    maxTokens: 1024,
    temperature: 0.2,
  },
};
// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Flattens AvailableModels into a single Set<string> for fast membership tests.
 */
function flattenAvailable(available) {
  if (!available)
    return new Set();
  return new Set([
    ...(available.anthropic ?? []),
    ...(available.openai ?? []),
    ...(available.groq ?? []),
    ...(available.mistral ?? []),
    ...(available.deepseek ?? []),
    ...(available.ollama ?? []),
    ...(available['github-copilot'] ?? []),
  ]);
}
/**
 * Returns the first tier model that is present in the available set, or
 * undefined if none of the tiers are available.
 */
function pickFromTiers(entry, available) {
  // If no available set was provided we trust all tiers
  if (available.size === 0)
    return entry.tier1;
  for (const tier of [entry.tier1, entry.tier2, entry.tier3]) {
    if (available.has(tier))
      return tier;
  }
  return undefined;
}
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Chooses the best model for the given task.
 *
 * Selection priority:
 *   1. Walk through tier1 → tier2 → tier3 for the task.
 *   2. If any tier model is in `availableModels`, pick it.
 *   3. If no tier matches (or no `availableModels` provided), prefer tier1.
 *   4. Fall back to `currentModel` if nothing matches.
 *
 * For `security-review` and `fix-code` the most capable model (tier1) is
 * always preferred, even over a potentially cheaper available option.
 * For `quick-scan` and `summarize` the fastest model (tier1, which is already
 * the cheap pick for those tasks) is preferred.
 */
export function routeModel(task, currentModel, availableModels) {
  const entry = ROUTING_TABLE[task];
  const available = flattenAvailable(availableModels);
  const chosen = pickFromTiers(entry, available) ?? currentModel;
  return {
    model: chosen,
    reason: entry.reason,
    maxTokens: entry.maxTokens,
    temperature: entry.temperature,
  };
}
/**
 * Infers the most appropriate TaskType from a freeform prompt string.
 *
 * Rules are applied in priority order — first match wins.
 */
export function getTaskType(prompt) {
  const lower = prompt.toLowerCase();
  // Security / review keywords
  if (/\b(review|audit|security|vulnerability|vulnerabilities|owasp|pentest)\b/.test(lower)) {
    return 'security-review';
  }
  // Code fix keywords
  if (/\b(fix|repair|correct|patch|resolve|remediate)\b/.test(lower)) {
    return 'fix-code';
  }
  // Planning keywords
  if (/\b(plan|architect|architecture|design|roadmap|strategy)\b/.test(lower)) {
    return 'plan';
  }
  // CI / test keywords
  if (/\b(test|failing|ci|npm test|yarn test|jest|mocha|pytest|unittest|github actions)\b/.test(lower)) {
    return 'ci-fix';
  }
  // Explanation keywords
  if (/\b(explain|what is|what are|why|how does|tell me about|describe)\b/.test(lower)) {
    return 'explain';
  }
  // Short prompts default to a quick scan
  if (prompt.trim().length < 100) {
    return 'quick-scan';
  }
  // Default: treat as a full security review
  return 'security-review';
}
/**
 * Formats a ModelRoute as a single human-readable hint line.
 *
 * Example: "Using claude-opus-4-8 for security review (highest reasoning capability)"
 */
export function formatModelRoutingHint(route) {
  // Map the reason back to a friendly task label for display
  const taskLabel = (() => {
    // Derive a display label from the reason by checking known reasons
    for (const [task, entry] of Object.entries(ROUTING_TABLE)) {
      if (entry.reason === route.reason) {
        return task.replace(/-/g, ' ');
      }
    }
    return 'task';
  })();
  return `Using ${route.model} for ${taskLabel} (${route.reason})`;
}
