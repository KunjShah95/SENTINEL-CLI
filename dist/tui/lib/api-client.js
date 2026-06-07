/**
 * TUI API client — TypeScript-friendly wrapper around the Node HTTP client
 * in `src/server/api/client.js`. Used by the chat hook and the session
 * screen to talk to the Sentinel Hono server.
 *
 * Mirrors the auto-generated `apiClient` from `hono/client` in
 * `packages/cli/src/lib/api-client.ts` (Nightcode).
 */
import { streamSse, Sessions as ServerSessions, Auth as ServerAuth } from "../../server/api/client.js";
export const Sessions = {
    async list() {
        try {
            const res = await ServerSessions.list();
            if (!res.ok)
                return [];
            return (await res.json());
        }
        catch {
            return [];
        }
    },
    async get(id) {
        try {
            const res = await ServerSessions.get(id);
            if (!res.ok)
                return null;
            return (await res.json());
        }
        catch {
            return null;
        }
    },
    async create(body) {
        try {
            const res = await ServerSessions.create(body);
            if (!res.ok)
                return null;
            return (await res.json());
        }
        catch {
            return null;
        }
    },
    async delete(id) {
        try {
            const res = await ServerSessions.delete(id);
            return res.ok;
        }
        catch {
            return false;
        }
    },
};
export const Auth = {
    async devLogin(userId) {
        const res = await ServerAuth.devLogin(userId);
        if (!res.ok)
            throw new Error(`Login failed: ${res.status}`);
        return (await res.json());
    },
    async devLogout(token) {
        const res = await ServerAuth.devLogout(token);
        return res.ok;
    },
    async ensure() {
        const { getAuth } = await import("../../server/api/client.js");
        const auth = getAuth();
        if (auth)
            return auth;
        const { token, userId } = await Auth.devLogin();
        const { saveAuth } = await import("../../server/api/client.js");
        saveAuth({ token, userId });
        return { token, userId };
    },
};
export async function checkServerHealth() {
    try {
        const res = await fetch(`http://localhost:${process.env.PORT || 3000}/health`, {
            signal: AbortSignal.timeout(2000)
        });
        return res.ok;
    }
    catch {
        return false;
    }
}
/**
 * Stream a chat request. Yields decoded SSE events.
 */
export async function* streamChat(body) {
    const iter = await streamSse("/chat", body);
    for await (const ev of iter) {
        yield ev;
    }
}
