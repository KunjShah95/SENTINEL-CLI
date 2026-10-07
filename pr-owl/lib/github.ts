/**
 * The GitHub REST calls PR Owl makes. Five of them, and no SDK.
 *
 * An SDK for the REST API is a dependency that has to be kept current, and its
 * value is typing a response shape that here is one `fetch` and a type alias
 * away. Everything is a `fetch` with an explicit timeout, because a webhook
 * handler that hangs holds a worker and eventually the whole deployment.
 */

/** App JWTs expire in 10 minutes; a request retry never outlives one. */
const TOKEN_TTL_S = 540;

type TokenCache = { token: string; expiresAt: number };

let cached: TokenCache | null = null;

/**
 * Mint an installation access token.
 *
 * Cached for most of its life. Minting one per request would be a rate-limit
 * bug waiting to happen: installation tokens are rate limited by the number of
 * tokens, not just by the number of calls.
 */
export async function installationToken(opts: {
  appId: string;
  privateKey: string;
  installationId: number;
  now?: () => number;
}): Promise<string> {
  const now = opts.now ?? Date.now;
  if (cached && cached.expiresAt > now()) return cached.token;

  const jwt = await signAppJwt(opts.appId, opts.privateKey, now);
  const res = await fetch(`https://api.github.com/app/installations/${opts.installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${jwt}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`mint token: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { token: string; expires_at: string };
  cached = {
    token: body.token,
    expiresAt: new Date(body.expires_at).getTime() - 60_000,
  };
  return cached.token;
}

/** Test hook — a cached token must never leak between tests. */
export function clearTokenCache(): void {
  cached = null;
}

/** RS256-signed JWT. The `iat` is backdated 60s to tolerate clock skew. */
async function signAppJwt(appId: string, privateKey: string, now: () => number): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const iat = Math.floor(now() / 1000) - 60;
  const payload = b64url(JSON.stringify({ iat, exp: iat + TOKEN_TTL_S, iss: appId }));
  const data = `${header}.${payload}`;

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data));
  return `${data}.${b64urlBytes(new Uint8Array(sig))}`;
}

function b64url(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url');
}
function b64urlBytes(b: Uint8Array): string {
  return Buffer.from(b).toString('base64url');
}

/** Strip the PEM armour so WebCrypto gets bare DER. */
function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function gh<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    // Every call bounded. A reviewer that hangs is indistinguishable from one
    // that crashed, and both hold a queue worker.
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`github ${path}: ${res.status} ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export type GhFile = {
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
};

export function getFiles(repo: string, prNumber: number, token: string): Promise<GhFile[]> {
  return gh<GhFile[]>(`/repos/${repo}/pulls/${prNumber}/files?per_page=100`, token);
}

export type GhComment = {
  path: string;
  line: number;
  side: 'RIGHT' | 'LEFT';
  body: string;
};

export type CreateReviewInput = {
  commitId: string;
  body: string;
  event: 'COMMENT' | 'REQUEST_CHANGES' | 'APPROVE';
  comments: GhComment[];
};

/**
 * Submit the review.
 *
 * `REQUEST_CHANGES` is chosen only when something critical was found, and only
 * with `COMMENT` otherwise — a bot that requests changes on a nit is a bot that
 * gets muted. The event is computed in `postReview`, not by the model: a model
 * that decided its own severity would eventually pick the strong one.
 */
export function createReview(repo: string, prNumber: number, input: CreateReviewInput, token: string): Promise<unknown> {
  return gh(`/repos/${repo}/pulls/${prNumber}/reviews`, token, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type CheckRun = {
  id: number;
  name: string;
  output: { title: string; summary: string };
  conclusion: 'success' | 'failure' | 'neutral' | null;
  status: 'queued' | 'in_progress' | 'completed';
};

export function createCheckRun(repo: string, input: { name: string; head_sha: string }, token: string): Promise<CheckRun> {
  return gh<CheckRun>(`/repos/${repo}/check-runs`, token, {
    method: 'POST',
    body: JSON.stringify({ ...input, status: 'in_progress' }),
  });
}

export function updateCheckRun(repo: string, checkId: number, input: Partial<CheckRun>, token: string): Promise<CheckRun> {
  return gh<CheckRun>(`/repos/${repo}/check-runs/${checkId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** Only ever called when a run must stop — never with credentials in the log. */
export function isRateLimited(res: Response): boolean {
  return res.status === 403 || res.status === 429;
}
