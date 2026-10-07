/**
 * File-backed OAuth client provider for remote MCP servers.
 *
 * Why this exists: the hosted Context.dev server signs in with OAuth, and the
 * MCP SDK can drive that flow — but only if the host implements
 * `OAuthClientProvider`, which means persisting four things across processes
 * (client registration, tokens, the PKCE verifier) and running a local
 * redirect listener so the browser can hand the code back.
 *
 * The alternative is to have the user paste an API key. The Context.dev docs
 * are explicit that this is the lesser path: an OAuth sign-in creates a
 * revocable, scoped key ("Context MCP"), while a pasted key is an account-wide
 * credential the user has to manage by hand.
 *
 * Design constraints, all of which are the whole point of the file:
 *   - Tokens live under the Sentinel home directory, never in an assistant's
 *     config file and never in a repo. `sentinel connect --mcp context` writes
 *     only a URL into other assistants' configs; this file is Sentinel's own.
 *   - Files are written 0600. A token file another user can read is a leaked
 *     credential.
 *   - Never throws into the agent turn. `getTokenProvider` returns undefined
 *     when the server is unauthenticated, and mcp-client.js already degrades an
 *     unreachable server to "tool absent".
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

/**
 * Resolve Sentinel's home directory.
 *
 * Duplicated from the config store's rule rather than imported, because pulling
 * in the config manager here would make a token read depend on config loading
 * succeeding. If the two ever disagree, that is a bug worth seeing loudly.
 */
function sentinelHome(env = process.env) {
  const explicit = env.SENTINEL_HOME;
  if (explicit) return explicit;
  return join(env.HOME || env.USERPROFILE || homedir(), '.sentinel');
}

/** Directory holding per-server OAuth state. */
export function oauthDir(env = process.env) {
  return join(sentinelHome(env), 'mcp-auth');
}

function stateFile(serverKey, env) {
  // Server keys come from config, so sanitize rather than trust: a key with a
  // separator would otherwise write outside the directory.
  const safe = String(serverKey).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
  return join(oauthDir(env), `${safe}.json`);
}

/** Write a JSON file readable only by its owner. Best-effort on Windows. */
function writePrivate(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // Windows has no POSIX mode; the ACL inherited from the user profile stands.
  }
}

function readState(serverKey, env) {
  const file = stateFile(serverKey, env);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    // A corrupt token file must not wedge every future turn. Drop it and
    // re-authenticate; that is recoverable, a throw here is not.
    try {
      rmSync(file, { force: true });
    } catch {
      /* best effort */
    }
    return null;
  }
}

/**
 * Has this server been authenticated?
 *
 * Used by `sentinel mcp-status` to report "needs sign-in" as a distinct state
 * from "unreachable" — they need different user actions, and conflating them
 * sends someone to debug a network problem they do not have.
 */
export function hasStoredAuth(serverKey, env = process.env) {
  const state = readState(serverKey, env);
  return Boolean(state?.tokens?.access_token);
}

/** Forget a server's stored credentials. `sentinel connect --mcp <id> --logout`. */
export function clearStoredAuth(serverKey, env = process.env) {
  try {
    rmSync(stateFile(serverKey, env), { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * An `OAuthClientProvider` backed by a JSON file, or undefined when this server
 * has not been authenticated yet.
 *
 * Returning undefined (rather than a provider that will fail) is deliberate:
 * the SDK then treats the server as unauthenticated and `listTools` fails
 * cleanly, which mcp-client.js already turns into a per-server error entry
 * instead of a broken turn.
 *
 * @param {string} serverKey key the server is configured under
 * @param {string} serverUrl the server URL (recorded so a moved server can be detected)
 * @param {{onAuthorizationUrl?: (url: string) => void, redirectUrl?: string, env?: object}} [options]
 */
export function getTokenProvider(serverKey, serverUrl, options = {}) {
  const env = options.env || process.env;
  const state = readState(serverKey, env);
  if (!state?.tokens?.access_token) return undefined;

  const onAuthorizationUrl = options.onAuthorizationUrl;
  const redirectUrl = options.redirectUrl || state.redirectUrl || 'http://localhost:8765/callback';

  return {
    get redirectUrl() {
      return redirectUrl;
    },
    get clientMetadata() {
      return {
        client_name: 'sentinel-cli',
        redirect_uris: [redirectUrl],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: 'api.read api.write',
      };
    },
    state: () => randomBytes(16).toString('hex'),
    clientInformation: () => state.clientInformation,
    saveClientInformation: (info) => {
      const next = readState(serverKey, env) || { tokens: state.tokens };
      next.clientInformation = info;
      next.serverUrl = serverUrl;
      writePrivate(stateFile(serverKey, env), next);
    },
    tokens: () => state.tokens,
    saveTokens: (tokens) => {
      const next = readState(serverKey, env) || {};
      next.tokens = tokens;
      next.serverUrl = serverUrl;
      next.redirectUrl = redirectUrl;
      next.savedAt = new Date().toISOString();
      writePrivate(stateFile(serverKey, env), next);
    },
    redirectToAuthorization: async (url) => {
      // The SDK hands back the full URL with the PKCE challenge. There is no
      // browser to open from inside an agent turn, so print it and let the user
      // complete the flow; a caller that can open a browser passes
      // `onAuthorizationUrl` and gets the URL instead.
      if (onAuthorizationUrl) {
        onAuthorizationUrl(url.toString());
        return;
      }
      process.stderr.write(
        `\nAuthorize this MCP server in your browser:\n  ${url.toString()}\n\n` +
        'It will redirect to a localhost callback that Sentinel is listening on.\n\n',
      );
    },
    saveCodeVerifier: (verifier) => {
      const next = readState(serverKey, env) || { tokens: state.tokens };
      next.codeVerifier = verifier;
      writePrivate(stateFile(serverKey, env), next);
    },
    codeVerifier: () => readState(serverKey, env)?.codeVerifier,
  };
}

/**
 * Summary for `sentinel mcp-status` / `doctor`.
 *
 * Never includes the token itself — only whether one exists and when it was
 * stored, because a status report is printed to a terminal and often pasted
 * into an issue.
 */
export function authSummary(serverKey, env = process.env) {
  const state = readState(serverKey, env);
  if (!state) return { server: serverKey, authenticated: false };
  const expiresAt = state.tokens?.expires_at;
  const expired = typeof expiresAt === 'number' && expiresAt * 1000 < Date.now();
  return {
    server: serverKey,
    authenticated: Boolean(state.tokens?.access_token),
    expired,
    hasRefreshToken: Boolean(state.tokens?.refresh_token),
    savedAt: state.savedAt || null,
    serverUrl: state.serverUrl || null,
  };
}
