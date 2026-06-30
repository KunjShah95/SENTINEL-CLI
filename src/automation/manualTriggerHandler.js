/**
 * Manual Trigger Handler
 *
 * Parses @sentinel commands from PR/MR comments:
 *   @sentinel review         — incremental review on new commits
 *   @sentinel full review    — full re-review of entire PR
 *   @sentinel pause          — pause auto-reviews on this PR
 *   @sentinel resume         — resume auto-reviews
 *   @sentinel resolve        — reset review count and resume
 *   @sentinel help           — show available commands
 */

const COMMAND_PATTERNS = [
  { regex: /@sentinel\s+full\s+review/i, action: 'full_review' },
  { regex: /@sentinel\s+review/i, action: 'review' },
  { regex: /@sentinel\s+pause/i, action: 'pause' },
  { regex: /@sentinel\s+resume/i, action: 'resume' },
  { regex: /@sentinel\s+resolve/i, action: 'resolve' },
  { regex: /@sentinel\s+help/i, action: 'help' },
];

export class ManualTriggerHandler {
  /**
   * Parse a comment body for sentinel commands.
   * @param {string} commentBody
   * @returns {{ action: string } | null}
   */
  parseComment(commentBody) {
    if (!commentBody || typeof commentBody !== 'string') return null;

    for (const { regex, action } of COMMAND_PATTERNS) {
      if (regex.test(commentBody)) {
        return { action };
      }
    }

    return null;
  }

  /**
   * Generate help text for comment commands.
   */
  getHelpText() {
    return `## 🛡️ Sentinel Review Commands

You can control Sentinel's auto-review behavior using these commands:

| Command | Description |
|---------|-------------|
| \`@sentinel review\` | Run incremental review on new commits |
| \`@sentinel full review\` | Full re-review of the entire PR |
| \`@sentinel pause\` | Pause automatic reviews on this PR |
| \`@sentinel resume\` | Resume automatic reviews |
| \`@sentinel resolve\` | Reset review count and resume reviews |
| \`@sentinel help\` | Show this help message |

---
_Powered by [Sentinel CLI](https://github.com/KunjShah95/SENTINEL-CLI)_`;
  }
}

export default ManualTriggerHandler;
