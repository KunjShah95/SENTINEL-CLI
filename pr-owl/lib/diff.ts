/**
 * Diff parsing — a re-export, not a second implementation.
 *
 * This file used to contain its own 273-line parser. Sentinel grew its own in
 * `src/agent/review-diff.js` when `sentinel review` moved the capability into
 * the CLI, and for a while there were two parsers in one repository with two
 * answers to the same question.
 *
 * That is precisely the failure this course warns about in part 11, and it is
 * worse here than a normal duplication: a line number that differs between the
 * two parsers does not throw, it posts a comment on the wrong line and looks
 * confident doing it. The two versions had already drifted — the PR Owl copy
 * lacked `fileText` and returned `truncated` differently.
 *
 * So: one implementation, in `src/agent/`, exported for both callers. The
 * comments there are the ones worth reading.
 */
export {
  parseFileDiff,
  parsePatches,
  commentablePositions,
  isPointable as isCommentable,
  fileText,
  diffSize,
  type DiffLine,
  type Hunk,
  type FileDiff,
} from '../../src/agent/review-diff.js';
