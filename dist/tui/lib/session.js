import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
const MAX_SESSIONS = 10;
function getSessionDir() {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    return `${home}/.sentinel/sessions`;
}
function getSessionFile(key) {
    return `${getSessionDir()}/${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
}
export function loadSession(key) {
    try {
        const file = getSessionFile(key);
        if (!existsSync(file))
            return null;
        return JSON.parse(readFileSync(file, "utf-8"));
    }
    catch {
        return null;
    }
}
export function saveSession(key, data) {
    try {
        const dir = getSessionDir();
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        const file = getSessionFile(key);
        writeFileSync(file, JSON.stringify(data, null, 2));
        rotateSessions(key);
    }
    catch { }
}
export function clearSession(key) {
    try {
        const file = getSessionFile(key);
        if (existsSync(file)) {
            unlinkSync(file);
        }
    }
    catch { }
}
function rotateSessions(currentKey) {
    try {
        const dir = getSessionDir();
        const files = readdirSync(dir)
            .filter((f) => f.endsWith(".json"))
            .map((f) => ({ name: f, path: join(dir, f), time: readFileSync(join(dir, f), "utf-8").length }))
            .sort((a, b) => b.time - a.time);
        if (files.length > MAX_SESSIONS) {
            for (const f of files.slice(MAX_SESSIONS)) {
                if (!f.name.includes(currentKey.replace(/[^a-zA-Z0-9_-]/g, "_"))) {
                    try {
                        unlinkSync(f.path);
                    }
                    catch { }
                }
            }
        }
    }
    catch { }
}
