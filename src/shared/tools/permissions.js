/**
 * Tool Permission System — per-tool allow/deny/ask rules.
 *
 * Inspired by opencode's permission model. Each tool can be configured
 * with one of three policies:
 *
 *   - 'allow' — tool executes without prompting
 *   - 'deny'  — tool is blocked entirely
 *   - 'ask'   — tool requires user confirmation (default for dangerous tools)
 *
 * Configuration lives in `.sentinel.yaml` under the `permissions` key:
 *
 *   permissions:
 *     tools:
 *       bash: ask
 *       writeFile: allow
 *       editFile: allow
 *       searchWeb: deny
 *     defaults:
 *       read: allow
 *       write: ask
 *       network: deny
 *
 * The permission check runs before the mode check so that even BUILD mode
 * cannot bypass an explicit deny.
 */

import { configManager } from '../../config/configManager.js';

// ── Tool categories ──────────────────────────────────────────────────

const TOOL_CATEGORIES = Object.freeze({
  // Read-only tools (safe)
  readFile: 'read',
  listDirectory: 'read',
  glob: 'read',
  grep: 'read',
  diffFile: 'read',

  // Write tools (modifies filesystem)
  writeFile: 'write',
  editFile: 'write',
  batchEdit: 'write',

  // Shell execution (high risk)
  bash: 'shell',

  // Network tools
  searchWeb: 'network',

  // Undo/redo (safe, operates on checkpoints)
  undoLastChange: 'undo',
  redoLastUndo: 'undo',
});

// ── Default policies per category ────────────────────────────────────

const DEFAULT_CATEGORY_POLICIES = Object.freeze({
  read: 'allow',
  write: 'allow',
  shell: 'ask',
  network: 'allow',
  undo: 'allow',
});

// ── Default policies per specific tool (override category) ───────────

const DEFAULT_TOOL_POLICIES = Object.freeze({
  bash: 'ask',
});

// ── Permission check ─────────────────────────────────────────────────

/**
 * Get the effective policy for a tool.
 * Priority: explicit tool policy > category default > hardcoded default
 *
 * @param {string} toolName
 * @returns {'allow' | 'deny' | 'ask'}
 */
export function getToolPolicy(toolName) {
  // 1. Check explicit per-tool config
  const config = configManager.config;
  const explicitPolicy = config?.permissions?.tools?.[toolName];
  if (explicitPolicy && ['allow', 'deny', 'ask'].includes(explicitPolicy)) {
    return explicitPolicy;
  }

  // 2. Check category default from config
  const category = TOOL_CATEGORIES[toolName];
  if (category) {
    const categoryPolicy = config?.permissions?.defaults?.[category];
    if (categoryPolicy && ['allow', 'deny', 'ask'].includes(categoryPolicy)) {
      return categoryPolicy;
    }
  }

  // 3. Hardcoded defaults
  if (category && DEFAULT_CATEGORY_POLICIES[category]) {
    return DEFAULT_CATEGORY_POLICIES[category];
  }

  // 4. Per-tool hardcoded override
  if (DEFAULT_TOOL_POLICIES[toolName]) {
    return DEFAULT_TOOL_POLICIES[toolName];
  }

  // Unknown tools default to 'ask' for safety
  return 'ask';
}

/**
 * Check if a tool is allowed to execute.
 * Returns an object with the decision and optional prompt message.
 *
 * @param {string} toolName
 * @returns {{ allowed: boolean, policy: string, message?: string }}
 */
export function checkPermission(toolName) {
  const policy = getToolPolicy(toolName);

  switch (policy) {
  case 'allow':
    return { allowed: true, policy };

  case 'deny':
    return {
      allowed: false,
      policy,
      message: `Tool "${toolName}" is denied by permission policy. Update .sentinel.yaml permissions.tools.${toolName} to 'allow' or 'ask'.`,
    };

  case 'ask':
    // In CLI/TUI mode, this would prompt the user. For now, allow but flag.
    return { allowed: true, policy, message: `Tool "${toolName}" requires confirmation.` };

  default:
    return { allowed: false, policy: 'unknown', message: `Unknown policy: ${policy}` };
  }
}

/**
 * Get the category of a tool.
 * @param {string} toolName
 * @returns {string}
 */
export function getToolCategory(toolName) {
  return TOOL_CATEGORIES[toolName] || 'unknown';
}

/**
 * List all tools with their current effective policies.
 * @returns {Array<{ tool: string, category: string, policy: string }>}
 */
export function listToolPermissions() {
  const allTools = Object.keys(TOOL_CATEGORIES);
  return allTools.map(tool => ({
    tool,
    category: TOOL_CATEGORIES[tool],
    policy: getToolPolicy(tool),
  }));
}

/**
 * Validate permissions config structure.
 * @param {object} permissions
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePermissionsConfig(permissions) {
  const errors = [];
  const validPolicies = ['allow', 'deny', 'ask'];
  const validCategories = ['read', 'write', 'shell', 'network', 'undo'];

  if (permissions.tools && typeof permissions.tools !== 'object') {
    errors.push('permissions.tools must be an object');
  } else if (permissions.tools) {
    for (const [tool, policy] of Object.entries(permissions.tools)) {
      if (!validPolicies.includes(policy)) {
        errors.push(`permissions.tools.${tool} must be one of: ${validPolicies.join(', ')}`);
      }
    }
  }

  if (permissions.defaults && typeof permissions.defaults !== 'object') {
    errors.push('permissions.defaults must be an object');
  } else if (permissions.defaults) {
    for (const [category, policy] of Object.entries(permissions.defaults)) {
      if (!validCategories.includes(category)) {
        errors.push(`permissions.defaults.${category} is not a valid category (${validCategories.join(', ')})`);
      }
      if (!validPolicies.includes(policy)) {
        errors.push(`permissions.defaults.${category} must be one of: ${validPolicies.join(', ')}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export { TOOL_CATEGORIES, DEFAULT_CATEGORY_POLICIES, DEFAULT_TOOL_POLICIES };
