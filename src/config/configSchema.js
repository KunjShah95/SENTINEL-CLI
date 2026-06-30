/**
 * Sentinel Configuration Schema
 *
 * JSON Schema definition for .sentinel.yaml configuration.
 * Validates all configuration options and provides sensible defaults.
 */

export const SENTINEL_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    version: { type: 'string', default: '1.0' },

    reviews: {
      type: 'object',
      properties: {
        auto_review: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: true },
            drafts: { type: 'boolean', default: false },
            base_branches: {
              type: 'array',
              items: { type: 'string' },
              default: ['main', 'develop', 'master']
            },
            labels: {
              type: 'array',
              items: { type: 'string' },
              default: []
            },
            ignore_title_keywords: {
              type: 'array',
              items: { type: 'string' },
              default: []
            },
            ignore_usernames: {
              type: 'array',
              items: { type: 'string' },
              default: []
            },
            description_keyword: { type: 'string', default: '' },
            auto_pause_after_reviewed_commits: { type: 'integer', default: 5, minimum: 1 },
            auto_incremental_review: { type: 'boolean', default: true }
          },
          additionalProperties: false
        },
        path_filters: {
          type: 'object',
          properties: {
            include: { type: 'array', items: { type: 'string' }, default: [] },
            exclude: { type: 'array', items: { type: 'string' }, default: ['node_modules/**', 'dist/**', 'build/**', '.git/**', 'coverage/**', 'vendor/**', '__pycache__/**'] }
          },
          additionalProperties: false
        },
        path_instructions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              instructions: { type: 'string' }
            },
            required: ['path', 'instructions'],
            additionalProperties: false
          },
          default: []
        },
        review_style: {
          type: 'object',
          properties: {
            tone: { type: 'string', enum: ['professional', 'casual', 'assertive'], default: 'professional' },
            detail_level: { type: 'string', enum: ['summary', 'standard', 'comprehensive'], default: 'standard' },
            emoji_usage: { type: 'string', enum: ['none', 'minimal', 'full'], default: 'full' },
            assertive_mode: { type: 'boolean', default: false }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    },

    knowledge_base: {
      type: 'object',
      properties: {
        code_guidelines: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: true },
            sources: {
              type: 'array',
              items: { type: 'string' },
              default: ['.cursorrules', 'CLAUDE.md', 'SENTINEL.md', '.github/copilot-instructions.md', '.editorconfig']
            }
          },
          additionalProperties: false
        },
        learnings: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: true },
            storage_path: { type: 'string', default: '.sentinel/learnings.json' }
          },
          additionalProperties: false
        },
        linked_issues: {
          type: 'object',
          properties: {
            github: { type: 'boolean', default: true },
            gitlab: { type: 'boolean', default: true },
            jira: { type: 'boolean', default: false },
            linear: { type: 'boolean', default: false }
          },
          additionalProperties: false
        },
        web_search: { type: 'boolean', default: true },
        past_pr_context: { type: 'boolean', default: true },
        multi_repo: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: false },
            repos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  url: { type: 'string' },
                  name: { type: 'string' }
                },
                required: ['url'],
                additionalProperties: false
              },
              default: []
            }
          },
          additionalProperties: false
        },
        opt_out: { type: 'boolean', default: false }
      },
      additionalProperties: false
    },

    pre_merge_checks: {
      type: 'object',
      properties: {
        docstring_coverage: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: false },
            threshold: { type: 'integer', default: 80, minimum: 0, maximum: 100 },
            mode: { type: 'string', enum: ['off', 'warning', 'error'], default: 'warning' }
          },
          additionalProperties: false
        },
        pr_title: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: false },
            pattern: { type: 'string', default: '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert):' },
            mode: { type: 'string', enum: ['off', 'warning', 'error'], default: 'error' }
          },
          additionalProperties: false
        },
        pr_description: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: false },
            template: { type: 'string', default: '' },
            min_length: { type: 'integer', default: 50 },
            mode: { type: 'string', enum: ['off', 'warning', 'error'], default: 'warning' }
          },
          additionalProperties: false
        },
        issue_assessment: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', default: false },
            mode: { type: 'string', enum: ['off', 'warning', 'error'], default: 'warning' }
          },
          additionalProperties: false
        },
        custom_checks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              instruction: { type: 'string' },
              mode: { type: 'string', enum: ['off', 'warning', 'error'], default: 'warning' }
            },
            required: ['name', 'instruction'],
            additionalProperties: false
          },
          default: [],
          maxItems: 20
        }
      },
      additionalProperties: false
    },

    sast: {
      type: 'object',
      properties: {
        auto_detect: { type: 'boolean', default: true },
        tools: {
          type: 'object',
          properties: {
            javascript: { type: 'array', items: { type: 'string' }, default: ['eslint'] },
            typescript: { type: 'array', items: { type: 'string' }, default: ['eslint'] },
            python: { type: 'array', items: { type: 'string' }, default: ['ruff', 'pylint'] },
            go: { type: 'array', items: { type: 'string' }, default: ['golangci-lint'] },
            java: { type: 'array', items: { type: 'string' }, default: ['pmd'] },
            kotlin: { type: 'array', items: { type: 'string' }, default: ['detekt'] },
            rust: { type: 'array', items: { type: 'string' }, default: ['clippy'] },
            ruby: { type: 'array', items: { type: 'string' }, default: ['rubocop', 'brakeman'] },
            swift: { type: 'array', items: { type: 'string' }, default: ['swiftlint'] },
            php: { type: 'array', items: { type: 'string' }, default: ['phpstan'] },
            c: { type: 'array', items: { type: 'string' }, default: ['clang-tidy', 'cppcheck'] },
            cpp: { type: 'array', items: { type: 'string' }, default: ['clang-tidy', 'cppcheck'] },
            shell: { type: 'array', items: { type: 'string' }, default: ['shellcheck'] },
            sql: { type: 'array', items: { type: 'string' }, default: ['sqlfluff'] }
          },
          additionalProperties: { type: 'array', items: { type: 'string' } }
        },
        security: {
          type: 'array',
          items: { type: 'string' },
          default: ['semgrep', 'osv-scanner', 'trufflehog']
        },
        iac: {
          type: 'array',
          items: { type: 'string' },
          default: ['checkov', 'trivy']
        },
        cicd: {
          type: 'array',
          items: { type: 'string' },
          default: ['actionlint']
        }
      },
      additionalProperties: false
    },

    autofix: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', default: true },
        auto_push: { type: 'boolean', default: false },
        generate_docstrings: { type: 'boolean', default: false },
        generate_tests: { type: 'boolean', default: false },
        resolve_conflicts: { type: 'boolean', default: false },
        confidence_threshold: { type: 'number', default: 0.8, minimum: 0, maximum: 1 }
      },
      additionalProperties: false
    },

    finishing_touches: {
      type: 'object',
      properties: {
        simplify_code: { type: 'boolean', default: true },
        custom_recipes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              instruction: { type: 'string' }
            },
            required: ['name', 'instruction'],
            additionalProperties: false
          },
          default: []
        }
      },
      additionalProperties: false
    },

    // Legacy fields preserved for backward compat
    project: { type: 'object', additionalProperties: true },
    analyzers: { type: 'array', items: { type: 'string' } },
    severityThreshold: { type: 'string' },
    preCommit: { type: 'object', additionalProperties: true },
    providers: { type: 'object', additionalProperties: true },
    agents: { type: 'object', additionalProperties: true },
    shell: { type: 'object', additionalProperties: true },
    mcpServers: { type: 'object', additionalProperties: true },
    lsp: { type: 'object', additionalProperties: true },
    debug: { type: 'boolean' },
    data: { type: 'object', additionalProperties: true },

    // ── Permission system (opencode-inspired) ─────────────────────────
    permissions: {
      type: 'object',
      properties: {
        tools: {
          type: 'object',
          additionalProperties: {
            type: 'string',
            enum: ['allow', 'deny', 'ask']
          },
          description: 'Per-tool permission policies (allow/deny/ask)'
        },
        defaults: {
          type: 'object',
          properties: {
            read: { type: 'string', enum: ['allow', 'deny', 'ask'], default: 'allow' },
            write: { type: 'string', enum: ['allow', 'deny', 'ask'], default: 'allow' },
            shell: { type: 'string', enum: ['allow', 'deny', 'ask'], default: 'ask' },
            network: { type: 'string', enum: ['allow', 'deny', 'ask'], default: 'allow' },
            undo: { type: 'string', enum: ['allow', 'deny', 'ask'], default: 'allow' }
          },
          additionalProperties: false,
          description: 'Default policies per tool category'
        }
      },
      additionalProperties: false
    }
  },
  additionalProperties: true
};

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  version: '1.0',
  reviews: {
    auto_review: {
      enabled: true,
      drafts: false,
      base_branches: ['main', 'develop', 'master'],
      labels: [],
      ignore_title_keywords: [],
      ignore_usernames: [],
      description_keyword: '',
      auto_pause_after_reviewed_commits: 5,
      auto_incremental_review: true
    },
    path_filters: {
      include: [],
      exclude: ['node_modules/**', 'dist/**', 'build/**', '.git/**', 'coverage/**', 'vendor/**', '__pycache__/**']
    },
    path_instructions: [],
    review_style: {
      tone: 'professional',
      detail_level: 'standard',
      emoji_usage: 'full',
      assertive_mode: false
    }
  },
  knowledge_base: {
    code_guidelines: {
      enabled: true,
      sources: ['.cursorrules', 'CLAUDE.md', 'SENTINEL.md', '.github/copilot-instructions.md', '.editorconfig']
    },
    learnings: {
      enabled: true,
      storage_path: '.sentinel/learnings.json'
    },
    linked_issues: {
      github: true,
      gitlab: true,
      jira: false,
      linear: false
    },
    web_search: true,
    past_pr_context: true,
    multi_repo: {
      enabled: false,
      repos: []
    },
    opt_out: false
  },
  pre_merge_checks: {
    docstring_coverage: { enabled: false, threshold: 80, mode: 'warning' },
    pr_title: { enabled: false, pattern: '^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert):', mode: 'error' },
    pr_description: { enabled: false, template: '', min_length: 50, mode: 'warning' },
    issue_assessment: { enabled: false, mode: 'warning' },
    custom_checks: []
  },
  sast: {
    auto_detect: true,
    tools: {
      javascript: ['eslint'],
      typescript: ['eslint'],
      python: ['ruff', 'pylint'],
      go: ['golangci-lint'],
      java: ['pmd'],
      kotlin: ['detekt'],
      rust: ['clippy'],
      ruby: ['rubocop', 'brakeman'],
      swift: ['swiftlint'],
      php: ['phpstan'],
      c: ['clang-tidy', 'cppcheck'],
      cpp: ['clang-tidy', 'cppcheck'],
      shell: ['shellcheck'],
      sql: ['sqlfluff']
    },
    security: ['semgrep', 'osv-scanner', 'trufflehog'],
    iac: ['checkov', 'trivy'],
    cicd: ['actionlint']
  },
  autofix: {
    enabled: true,
    auto_push: false,
    generate_docstrings: false,
    generate_tests: false,
    resolve_conflicts: false,
    confidence_threshold: 0.8
  },
  finishing_touches: {
    simplify_code: true,
    custom_recipes: []
  },
  permissions: {
    tools: {},
    defaults: {
      read: 'allow',
      write: 'allow',
      shell: 'ask',
      network: 'allow',
      undo: 'allow'
    }
  }
};

/**
 * Validate a config object against the schema (lightweight, no ajv needed).
 * Returns { valid: boolean, errors: string[] }.
 */
export function validateConfig(config) {
  const errors = [];

  if (config.version && typeof config.version !== 'string') {
    errors.push('version must be a string');
  }

  if (config.reviews) {
    const ar = config.reviews.auto_review;
    if (ar) {
      if (typeof ar.enabled !== 'undefined' && typeof ar.enabled !== 'boolean') {
        errors.push('reviews.auto_review.enabled must be a boolean');
      }
      if (ar.base_branches && !Array.isArray(ar.base_branches)) {
        errors.push('reviews.auto_review.base_branches must be an array');
      }
      if (ar.auto_pause_after_reviewed_commits !== undefined) {
        if (typeof ar.auto_pause_after_reviewed_commits !== 'number' || ar.auto_pause_after_reviewed_commits < 1) {
          errors.push('reviews.auto_review.auto_pause_after_reviewed_commits must be a positive integer');
        }
      }
    }

    const pf = config.reviews.path_filters;
    if (pf) {
      if (pf.include && !Array.isArray(pf.include)) errors.push('reviews.path_filters.include must be an array');
      if (pf.exclude && !Array.isArray(pf.exclude)) errors.push('reviews.path_filters.exclude must be an array');
    }

    if (config.reviews.path_instructions && !Array.isArray(config.reviews.path_instructions)) {
      errors.push('reviews.path_instructions must be an array');
    }

    const rs = config.reviews.review_style;
    if (rs) {
      if (rs.tone && !['professional', 'casual', 'assertive'].includes(rs.tone)) {
        errors.push('reviews.review_style.tone must be one of: professional, casual, assertive');
      }
      if (rs.detail_level && !['summary', 'standard', 'comprehensive'].includes(rs.detail_level)) {
        errors.push('reviews.review_style.detail_level must be one of: summary, standard, comprehensive');
      }
    }
  }

  if (config.pre_merge_checks?.custom_checks) {
    if (!Array.isArray(config.pre_merge_checks.custom_checks)) {
      errors.push('pre_merge_checks.custom_checks must be an array');
    } else if (config.pre_merge_checks.custom_checks.length > 20) {
      errors.push('pre_merge_checks.custom_checks cannot exceed 20 items');
    }
  }

  if (config.autofix) {
    if (config.autofix.confidence_threshold !== undefined) {
      const ct = config.autofix.confidence_threshold;
      if (typeof ct !== 'number' || ct < 0 || ct > 1) {
        errors.push('autofix.confidence_threshold must be a number between 0 and 1');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
