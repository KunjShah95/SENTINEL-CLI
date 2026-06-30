/**
 * Database package entry point.
 *
 * Re-exports the adapter layer and helpers so consumers can do:
 *   import { getDatabase, createSession } from "@sentinel/database";
 */

export { getDatabase, setDatabase, resetDatabase, JsonAdapter, SqliteAdapter, PrismaAdapter } from './adapter.js';
export {
  createSession,
  getSession,
  listSessions,
  appendMessages,
  updateSessionStatus,
  deleteSession,
  recordCredit,
  getUsedCredits,
} from './sessions.js';
