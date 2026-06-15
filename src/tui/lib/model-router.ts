/**
 * Model Router — smart model selection based on task type.
 *
 * Inspired by how tools like CodeRabbit and Claude Code dispatch different
 * models for different tasks (reasoning-heavy vs. cheap-and-fast). The router
 * uses a static preference table and the user's currently selected model as a
 * fallback, keeping it entirely stateless and free of network calls.
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export type TaskType =
  | 'security-review'   // full codebase review — needs smart reasoning
  | 'quick-scan'        // fast scan — can use cheaper model
  | 'fix-code'          // code generation — needs capable model
  | 'plan'              // planning — needs reasoning
  | 'explain'           // explanation — any model works
  | 'ci-fix'            // fix test failures — needs good model
  | 'summarize';        // summarize results — simple task

export type ModelRoute = {
  model: string;
  reason: string;
  maxTokens?: number;
  temperature?: number;
};

export type AvailableModels = {
  anthropic: string[];
  openai: string[];
  groq: string[];
  mistral: string[];
  deepseek: string[];
  xai: string[];
  together: string[];
  fireworks: string[];
  perplexity: string[];
  openrouter: string[];
  ollama: string[];
  lmstudio: string[];
};

// ─── Routing table ────────────────────────────────────────────────────────────

/**
 * Each entry defines ordered preference tiers:
 *   tier1 — best / most capable model for this task
 *   tier2 — capable but cheaper fallback
 *   tier3 — fast / cheapest acceptable option
 *
 * plus optional inference parameters.
 */
type RoutingEntry = {
  tier1: string;
  tier2: string;
  tier3: string;
  reason: string;
  maxTokens?: number;
  temperature?: number;
};

const ROUTING_TABLE: Record<TaskType, RoutingEntry> = {
  'security-review': {
    tier1: 'claude-opus-4-6',
    tier2: 'deepseek-reasoner',
    tier3: 'grok-3',
    reason: 'highest reasoning capability',
    maxTokens: 8192,
    temperature: 0.1,
  },
  'fix-code': {
    tier1: 'claude-sonnet-4-6',
    tier2: 'codestral-latest',
    tier3: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    reason: 'strong code generation',
    maxTokens: 8192,
    temperature: 0.2,
  },
  'plan': {
    tier1: 'claude-opus-4-6',
    tier2: 'deepseek-reasoner',
    tier3: 'grok-3-mini',
    reason: 'deep reasoning for architecture',
    maxTokens: 4096,
    temperature: 0.3,
  },
  'ci-fix': {
    tier1: 'claude-sonnet-4-6',
    tier2: 'gpt-5.4',
    tier3: 'llama-3.3-70b-versatile',
    reason: 'good model for test-failure analysis',
    maxTokens: 4096,
    temperature: 0.15,
  },
  'quick-scan': {
    tier1: 'claude-haiku-4-5',
    tier2: 'llama-3.1-8b-instant',
    tier3: 'gemma2-9b-it',
    reason: 'fast and cost-efficient for quick scans',
    maxTokens: 2048,
    temperature: 0.0,
  },
  'explain': {
    tier1: 'claude-haiku-4-5',
    tier2: 'mistral-small-latest',
    tier3: 'llama-3.1-8b-instant',
    reason: 'any capable model for explanations',
    maxTokens: 2048,
    temperature: 0.4,
  },
  'summarize': {
    tier1: 'claude-haiku-4-5',
    tier2: 'gpt-4o-mini',
    tier3: 'claude-haiku-4-5',
    reason: 'lightweight model sufficient for summaries',
    maxTokens: 1024,
    temperature: 0.2,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Flattens AvailableModels into a single Set<string> for fast membership tests.
 */
function flattenAvailable(available?: Partial<AvailableModels>): Set<string> {
  if (!available) return new Set();
  return new Set([
    ...(available.anthropic ?? []),
    ...(available.openai ?? []),
    ...(available.groq ?? []),
    ...(available.ollama ?? []),
  ]);
}

/**
 * Returns the first tier model that is present in the available set, or
 * undefined if none of the tiers are available.
 */
function pickFromTiers(
  entry: RoutingEntry,
  available: Set<string>
): string | undefined {
  // If no available set was provided we trust all tiers
  if (available.size === 0) return entry.tier1;
  for (const tier of [entry.tier1, entry.tier2, entry.tier3] as const) {
    if (available.has(tier)) return tier;
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
export function routeModel(
  task: TaskType,
  currentModel: string,
  availableModels?: Partial<AvailableModels>
): ModelRoute {
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
export function getTaskType(prompt: string): TaskType {
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
export function formatModelRoutingHint(route: ModelRoute): string {
  // Map the reason back to a friendly task label for display
  const taskLabel = (() => {
    // Derive a display label from the reason by checking known reasons
    for (const [task, entry] of Object.entries(ROUTING_TABLE) as [TaskType, RoutingEntry][]) {
      if (entry.reason === route.reason) {
        return task.replace(/-/g, ' ');
      }
    }
    return 'task';
  })();

  return `Using ${route.model} for ${taskLabel} (${route.reason})`;
}
