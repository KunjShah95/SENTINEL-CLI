import { jsx as _jsx, jsxs as _jsxs } from "@opentui/react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
import { TextAttributes } from "@opentui/core";
import { useKeyboardLayer } from "../../providers/keyboard-layer";
import { useTheme } from "../../providers/theme";
import { useDialog } from "../../providers/dialog";
import { useToast } from "../../providers/toast";
import { usePromptConfig } from "../../providers/prompt-config";
import { Auth } from "../../lib/api-client";
const MAX_VISIBLE = 9;
const UPGRADE_URL = "https://sentinel.dev/billing";
export const COMMAND_MENU_CLEAR_EVENT = "sentinel:chat:clear";
const COMMANDS = [
    { name: "/help", description: "Show available commands" },
    { name: "/clear", description: "Clear the current chat history" },
    { name: "/mode", description: "Toggle between BUILD and PLAN mode" },
    { name: "/model", description: "Switch to a different model", usage: "/model <name>" },
    { name: "/login", description: "Sign in to Sentinel" },
    { name: "/logout", description: "Sign out" },
    { name: "/upgrade", description: "Open billing page to upgrade" },
    { name: "/status", description: "Show session, mode, and model" },
];
export function CommandMenu({ onClear, sessionId }) {
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef(null);
    const { isTopLayer, push, pop } = useKeyboardLayer();
    const { colors } = useTheme();
    const { close } = useDialog();
    const toast = useToast();
    const { mode, model, toggleMode, setModel, availableModels } = usePromptConfig();
    useEffect(() => {
        push("command-menu");
        return () => pop("command-menu");
    }, [push, pop]);
    const { entries, isModelSubMenu } = useMemo(() => {
        const trimmed = query.trim();
        if (trimmed === "/model" || trimmed.startsWith("/model ")) {
            const prefix = trimmed.length > 6 ? trimmed.slice(7).trim().toLowerCase() : "";
            const matches = availableModels
                .filter((m) => {
                if (prefix.length === 0)
                    return true;
                return (m.id.toLowerCase().includes(prefix) ||
                    (m.label || "").toLowerCase().includes(prefix));
            })
                .map((m) => ({
                name: `/model ${m.id}`,
                description: m.label || m.id,
            }));
            return { entries: matches, isModelSubMenu: true };
        }
        const needle = trimmed.replace(/^\//, "").toLowerCase();
        const filtered = needle.length === 0
            ? COMMANDS
            : COMMANDS.filter((c) => c.name.slice(1).toLowerCase().startsWith(needle) ||
                c.description.toLowerCase().includes(needle));
        return { entries: filtered, isModelSubMenu: false };
    }, [query, availableModels]);
    const setInputValue = useCallback((next) => {
        setQuery(next);
        setSelectedIndex(0);
        if (inputRef.current) {
            try {
                inputRef.current.value = next;
            }
            catch {
                // ignore — uncontrolled input fallback
            }
        }
    }, []);
    const fireClear = useCallback(() => {
        if (onClear) {
            onClear();
            return;
        }
        try {
            const g = globalThis;
            if (typeof g.dispatchEvent === "function" && typeof g.Event === "function") {
                g.dispatchEvent(new g.Event(COMMAND_MENU_CLEAR_EVENT));
            }
        }
        catch {
            // ignore — host screen may not be listening
        }
    }, [onClear]);
    const runCommand = useCallback(async (entry) => {
        const fullName = entry.name;
        if (fullName.startsWith("/model ")) {
            const id = fullName.slice(7).trim();
            if (id.length > 0) {
                setModel(id);
                toast.success(`Model: ${id}`);
            }
            close();
            return;
        }
        switch (fullName) {
            case "/help": {
                setInputValue("");
                return;
            }
            case "/clear": {
                fireClear();
                toast.success("Chat cleared");
                break;
            }
            case "/mode": {
                const next = mode === "BUILD" ? "PLAN" : "BUILD";
                toggleMode();
                toast.info(`Mode: ${next}`);
                break;
            }
            case "/model": {
                setInputValue("/model ");
                return;
            }
            case "/login": {
                try {
                    const res = await Auth.devLogin();
                    const { saveAuth } = await import("../../../server/api/client.js");
                    saveAuth({ token: res.token, userId: res.userId });
                    toast.success(`Signed in as ${res.userId}`);
                }
                catch (e) {
                    toast.error(e?.message || "Login failed");
                }
                break;
            }
            case "/logout": {
                try {
                    const { getAuth, clearAuth } = await import("../../../server/api/client.js");
                    const auth = getAuth?.();
                    if (auth?.token) {
                        try {
                            await Auth.devLogout(auth.token);
                        }
                        catch {
                            // ignore server-side failure; still clear local state
                        }
                    }
                    clearAuth?.();
                    toast.success("Signed out");
                }
                catch (e) {
                    toast.error(e?.message || "Logout failed");
                }
                break;
            }
            case "/upgrade": {
                toast.info(`Upgrade: ${UPGRADE_URL}`);
                break;
            }
            case "/status": {
                const sid = sessionId ? sessionId.slice(0, 8) : "none";
                toast.info(`session=${sid} mode=${String(mode)} model=${model}`);
                break;
            }
            default: {
                break;
            }
        }
        close();
    }, [close, fireClear, toggleMode, setModel, setInputValue, mode, model, sessionId, toast]);
    const handleChange = useCallback((value) => {
        setQuery(value);
        setSelectedIndex(0);
    }, []);
    const handleSubmit = useCallback(() => {
        const entry = entries[selectedIndex];
        if (entry)
            runCommand(entry);
    }, [entries, selectedIndex, runCommand]);
    useKeyboard((key) => {
        if (!isTopLayer("command-menu"))
            return;
        if (key.name === "up") {
            setSelectedIndex((p) => Math.max(0, p - 1));
            return;
        }
        if (key.name === "down") {
            setSelectedIndex((p) => Math.min(Math.max(entries.length - 1, 0), p + 1));
            return;
        }
        if (key.name === "escape") {
            close();
            return;
        }
        if (!key.ctrl && !key.meta && key.number) {
            const n = Number(key.name);
            if (Number.isInteger(n) && n >= 1 && n <= 9 && entries[n - 1]) {
                runCommand(entries[n - 1]);
            }
        }
    });
    const visibleHeight = Math.min(Math.max(entries.length, 1), MAX_VISIBLE);
    const nameWidth = isModelSubMenu ? 32 : 18;
    return (_jsxs("box", { flexDirection: "column", gap: 1, children: [_jsx("input", { ref: inputRef, placeholder: isModelSubMenu ? "Filter models..." : "Type a command...", focused: true, onInput: handleChange, onSubmit: handleSubmit }), entries.length === 0 ? (_jsx("text", { attributes: TextAttributes.DIM, children: isModelSubMenu ? "No matching models" : "No matching commands" })) : (_jsx("scrollbox", { height: visibleHeight, children: entries.map((entry, i) => {
                    const isSelected = i === selectedIndex;
                    const numberHint = i < 9 ? String(i + 1) : " ";
                    return (_jsxs("box", { flexDirection: "row", gap: 1, backgroundColor: isSelected ? colors.selection + "40" : undefined, paddingX: 1, children: [_jsx("text", { fg: colors.dimSeparator, width: 2, children: numberHint }), _jsx("text", { fg: isSelected ? colors.selection : colors.primary, width: nameWidth, attributes: isSelected ? TextAttributes.BOLD : 0, children: entry.usage || entry.name }), _jsx("text", { attributes: TextAttributes.DIM, children: entry.description })] }, entry.name));
                }) })), _jsxs("box", { flexDirection: "row", gap: 2, children: [_jsx("text", { attributes: TextAttributes.DIM, children: "\u2191\u2193 select" }), _jsx("text", { attributes: TextAttributes.DIM, children: "enter run" }), _jsx("text", { attributes: TextAttributes.DIM, children: "1-9 jump" }), _jsx("text", { attributes: TextAttributes.DIM, children: "esc close" })] })] }));
}
