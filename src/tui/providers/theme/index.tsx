import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { THEMES, DEFAULT_THEME, type Theme } from "../../theme";

let _externalSetTheme: ((name: string) => void) | null = null;
export function applyTheme(name: string) {
  _externalSetTheme?.(name);
}

type ThemeContextValue = {
  theme: Theme;
  setTheme: (name: string) => void;
  themes: Theme[];
  colors: Theme["colors"];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getPrefsPath() {
  const home = process.env.HOME || process.env.USERPROFILE || "~";
  return `${home}/.sentinel/preferences.json`;
}

function loadSavedTheme(): Theme {
  try {
    const prefsPath = getPrefsPath();
    if (existsSync(prefsPath)) {
      const prefs = JSON.parse(readFileSync(prefsPath, "utf-8"));
      if (prefs.theme) {
        const found = THEMES.find((t) => t.name === prefs.theme);
        if (found) return found;
      }
    }
  } catch {}
  return DEFAULT_THEME;
}

function saveTheme(name: string) {
  try {
    const prefsPath = getPrefsPath();
    const dir = dirname(prefsPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    let prefs: Record<string, unknown> = {};
    if (existsSync(prefsPath)) prefs = JSON.parse(readFileSync(prefsPath, "utf-8"));
    prefs.theme = name;
    writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
  } catch {}
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(loadSavedTheme);

  const setTheme = useCallback((name: string) => {
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

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES, colors: theme.colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
