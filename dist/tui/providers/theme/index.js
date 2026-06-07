import { jsx as _jsx } from "@opentui/react/jsx-runtime";
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { THEMES, DEFAULT_THEME } from "../../theme";
let _externalSetTheme = null;
export function applyTheme(name) {
    _externalSetTheme?.(name);
}
const ThemeContext = createContext(null);
function getPrefsPath() {
    const home = process.env.HOME || process.env.USERPROFILE || "~";
    return `${home}/.sentinel/preferences.json`;
}
function loadSavedTheme() {
    try {
        const prefsPath = getPrefsPath();
        if (existsSync(prefsPath)) {
            const prefs = JSON.parse(readFileSync(prefsPath, "utf-8"));
            if (prefs.theme) {
                const found = THEMES.find((t) => t.name === prefs.theme);
                if (found)
                    return found;
            }
        }
    }
    catch { }
    return DEFAULT_THEME;
}
function saveTheme(name) {
    try {
        const prefsPath = getPrefsPath();
        const dir = dirname(prefsPath);
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        let prefs = {};
        if (existsSync(prefsPath))
            prefs = JSON.parse(readFileSync(prefsPath, "utf-8"));
        prefs.theme = name;
        writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
    }
    catch { }
}
export function ThemeProvider({ children }) {
    const [theme, setThemeState] = useState(loadSavedTheme);
    const setTheme = useCallback((name) => {
        const found = THEMES.find((t) => t.name === name);
        if (found) {
            setThemeState(found);
            saveTheme(name);
        }
    }, []);
    useEffect(() => {
        _externalSetTheme = setTheme;
        return () => { _externalSetTheme = null; };
    }, [setTheme]);
    return (_jsx(ThemeContext.Provider, { value: { theme, setTheme, themes: THEMES, colors: theme.colors }, children: children }));
}
export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx)
        throw new Error("useTheme must be used within ThemeProvider");
    return ctx;
}
