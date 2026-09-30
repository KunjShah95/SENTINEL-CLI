/**
 * opencode theme loader.
 *
 * The JSON files in ./opencode are copied unmodified from sst/opencode
 * (packages/tui/src/theme/assets, MIT — see ./opencode/LICENSE). This module
 * reimplements opencode's resolveTheme(): `defs` aliases, references between
 * theme keys, {dark, light} variants and 256-color ANSI indices, resolved
 * to hex strings for Ink.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type ColorValue = string | number | { dark: ColorValue; light: ColorValue };
export type OpencodeThemeJson = {
  defs?: Record<string, ColorValue>;
  theme: Record<string, ColorValue>;
};

const ANSI16 = [
  "#000000", "#800000", "#008000", "#808000", "#000080", "#800080", "#008080", "#c0c0c0",
  "#808080", "#ff0000", "#00ff00", "#ffff00", "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
];

/** xterm 256-color index → hex. */
export function ansiToHex(n: number): string {
  if (n < 16) return ANSI16[n] ?? "#000000";
  if (n < 232) {
    const i = n - 16;
    const steps = [0, 95, 135, 175, 215, 255];
    const r = steps[Math.floor(i / 36)];
    const g = steps[Math.floor((i % 36) / 6)];
    const b = steps[i % 6];
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }
  const v = 8 + (n - 232) * 10;
  const h = v.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

/** #rgb / #rgba / #rrggbbaa → #rrggbb (alpha is dropped: terminals have none). */
export function normalizeHex(c: string): string {
  const h = c.slice(1);
  if (h.length === 3 || h.length === 4) return `#${h.slice(0, 3).split("").map((x) => x + x).join("")}`.toLowerCase();
  return `#${h.slice(0, 6)}`.toLowerCase();
}

/** Resolve every theme key to a hex string ("" for transparent). */
export function resolveOpencodeTheme(json: OpencodeThemeJson, mode: "dark" | "light" = "dark"): Record<string, string> {
  const defs = json.defs ?? {};
  const resolve = (c: ColorValue, chain: string[] = []): string => {
    if (typeof c === "number") return ansiToHex(c);
    if (typeof c === "string") {
      if (c === "transparent" || c === "none") return "";
      if (c.startsWith("#")) return normalizeHex(c);
      if (chain.includes(c)) throw new Error(`Circular color reference: ${[...chain, c].join(" -> ")}`);
      const next = defs[c] ?? json.theme[c];
      if (next === undefined) throw new Error(`Color reference "${c}" not found`);
      return resolve(next, [...chain, c]);
    }
    return resolve(c[mode], chain);
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(json.theme)) {
    if (k === "thinkingOpacity") continue;
    out[k] = resolve(v);
  }
  return out;
}

const DIR = join(dirname(fileURLToPath(import.meta.url)), "opencode");

const DISPLAY_NAMES: Record<string, string> = {
  opencode: "OpenCode",
  "one-dark": "One Dark (opencode)",
  "catppuccin": "Catppuccin (opencode)",
  "catppuccin-frappe": "Catppuccin Frappé",
  "catppuccin-macchiato": "Catppuccin Macchiato",
  github: "GitHub",
  nightowl: "Night Owl",
  rosepine: "Rosé Pine",
  synthwave84: "Synthwave '84",
  "lucent-orng": "Lucent Orng",
  "osaka-jade": "Osaka Jade",
};

export function displayName(file: string): string {
  const base = file.replace(/\.json$/, "");
  return DISPLAY_NAMES[base] ?? base.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

/** All bundled opencode themes, resolved for dark terminals. Never throws. */
export function loadOpencodeThemes(): Array<{ id: string; name: string; tokens: Record<string, string> }> {
  let files: string[] = [];
  try {
    files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const out: Array<{ id: string; name: string; tokens: Record<string, string> }> = [];
  for (const f of files) {
    try {
      const json = JSON.parse(readFileSync(join(DIR, f), "utf8")) as OpencodeThemeJson;
      out.push({ id: f.replace(/\.json$/, ""), name: displayName(f), tokens: resolveOpencodeTheme(json, "dark") });
    } catch {
      // A malformed theme file must never take the TUI down.
    }
  }
  return out;
}
