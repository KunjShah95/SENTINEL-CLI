/**
 * Subagent @Mention Routing — opencode-inspired agent routing.
 *
 * When a user types `@agent-name` in their message, the message is
 * routed to the specified agent. This enables multi-agent workflows
 * directly from the chat input.
 *
 * Built-in agent mentions:
 *   @coder     — code generation and editing agent
 *   @reviewer  — code review specialist
 *   @security  — security analysis agent
 *   @planner   — planning and architecture agent
 *   @tester    — test generation agent
 *   @docs      — documentation agent
 *   @debugger  — debugging specialist
 *
 * Custom agent mentions can be configured in .sentinel.yaml:
 *   agents:
 *     custom:
 *       devops: { model: "claude-3-5-sonnet", systemPrompt: "You are a DevOps specialist..." }
 *
 * Usage in messages:
 *   "@security Scan this file for SQL injection vulnerabilities"
 *   "@reviewer Check my implementation of the auth middleware"
 *   "@planner Design a caching strategy for the API"
 */

// ── Agent definitions ────────────────────────────────────────────────

export const BUILTIN_AGENTS = Object.freeze({
  coder: {
    name: 'coder',
    label: 'Coder',
    description: 'Code generation and editing',
    mode: 'BUILD',
    systemHint: 'Focus on writing clean, efficient code with proper error handling.',
  },
  reviewer: {
    name: 'reviewer',
    label: 'Reviewer',
    description: 'Code review specialist',
    mode: 'REVIEW',
    systemHint: 'Review code for bugs, security issues, performance, and best practices. Be thorough but constructive.',
  },
  security: {
    name: 'security',
    label: 'Security',
    description: 'Security analysis',
    mode: 'SCAN',
    systemHint: 'Focus exclusively on security vulnerabilities: injection, auth, data exposure, OWASP Top 10.',
  },
  planner: {
    name: 'planner',
    label: 'Planner',
    description: 'Architecture and planning',
    mode: 'PLAN',
    systemHint: 'Help plan architecture, design decisions, and implementation strategies. Think step by step.',
  },
  tester: {
    name: 'tester',
    label: 'Tester',
    description: 'Test generation',
    mode: 'BUILD',
    systemHint: 'Generate comprehensive unit tests with edge cases, error paths, and success paths.',
  },
  docs: {
    name: 'docs',
    label: 'Docs',
    description: 'Documentation',
    mode: 'PLAN',
    systemHint: 'Generate clear, concise documentation. Include examples and usage patterns.',
  },
  debugger: {
    name: 'debugger',
    label: 'Debugger',
    description: 'Debugging specialist',
    mode: 'BUILD',
    systemHint: 'Analyze bugs systematically. Identify root causes and suggest fixes with explanations.',
  },
});

// ── Mention parsing ──────────────────────────────────────────────────

const MENTION_REGEX = /@(\w+)/g;

/**
 * Parse @mentions from a message.
 * @param {string} message — user input text
 * @returns {{ mentions: Array<{ name: string, start: number, end: number }>, cleanMessage: string }}
 */
export function parseMentions(message) {
  const mentions = [];
  let match;

  // Reset regex state
  MENTION_REGEX.lastIndex = 0;

  while ((match = MENTION_REGEX.exec(message)) !== null) {
    const name = match[1].toLowerCase();
    if (BUILTIN_AGENTS[name] || isCustomAgent(name)) {
      mentions.push({
        name,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // Remove mentions from message to get clean prompt
  let cleanMessage = message;
  for (let i = mentions.length - 1; i >= 0; i--) {
    const m = mentions[i];
    cleanMessage = cleanMessage.slice(0, m.start) + cleanMessage.slice(m.end);
  }
  cleanMessage = cleanMessage.trim();

  return { mentions, cleanMessage };
}

/**
 * Check if a name is a registered custom agent.
 * @param {string} name — agent name (lowercase)
 * @returns {boolean}
 */
export function isCustomAgent(name) {
  // Custom agents would be loaded from config — for now, always false
  // This will be wired when agents config is loaded
  return false;
}

/**
 * Get agent definition by name.
 * @param {string} name — agent name (lowercase)
 * @returns {object|null} — agent definition or null
 */
export function getAgent(name) {
  const normalized = name.toLowerCase();
  return BUILTIN_AGENTS[normalized] || null;
}

/**
 * List all available agents for autocomplete.
 * @returns {Array<{ name: string, label: string, description: string }>}
 */
export function listAgents() {
  return Object.values(BUILTIN_AGENTS).map(a => ({
    name: a.name,
    label: a.label,
    description: a.description,
  }));
}

/**
 * Build a routed prompt for the specified agent.
 * @param {string} agentName — agent name
 * @param {string} cleanMessage — message without @mentions
 * @param {object} [options] — { mode, model }
 * @returns {{ prompt: string, mode: string, agentHint: string } | null}
 */
export function buildAgentPrompt(agentName, cleanMessage, options = {}) {
  const agent = getAgent(agentName);
  if (!agent) return null;

  const prompt = cleanMessage || `Perform your role as ${agent.label}.`;

  return {
    prompt,
    mode: agent.mode || options.mode || 'BUILD',
    agentHint: agent.systemHint,
    agent,
  };
}

/**
 * Get autocomplete suggestions for @mentions.
 * @param {string} partial — text typed after @
 * @returns {Array<{ name: string, label: string, description: string }>}
 */
export function getAgentSuggestions(partial = '') {
  const agents = listAgents();
  if (!partial) return agents;

  const lower = partial.toLowerCase();
  return agents.filter(a =>
    a.name.startsWith(lower) ||
    a.label.toLowerCase().startsWith(lower) ||
    a.description.toLowerCase().includes(lower)
  );
}
