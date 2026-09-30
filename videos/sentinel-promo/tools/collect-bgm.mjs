// Re-apply the product-launch neutral -> PL meta translation for the BGM track that
// MusicGen generated in a detached process. The wrapper hardcodes bgm mode "retrieve"
// (no wait-bgm step), so it cannot collect its own detached generate. This reproduces
// toProductLaunchMeta() exactly, with the track's real measured duration filled in.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";

const root = process.cwd();
const neutral = JSON.parse(readFileSync(join(root, "audio_engine_meta.json"), "utf8"));

const voices = (neutral.voices ?? []).map((v) => ({
  frame: Number(v.id),
  path: v.path,
  duration_s: v.duration_s,
  words: (v.words ?? []).map((w) => ({ id: w.id, text: w.text, start: w.start, end: w.end })),
}));

let bgm = null;
if (neutral.bgm?.path && existsSync(join(root, neutral.bgm.path))) {
  const abs = join(root, neutral.bgm.path);
  const r = spawnSync("ffmpeg", ["-i", abs], { encoding: "utf8" });
  const m = String(r.stderr || "").match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  const duration_s = m
    ? Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000) / 1000
    : null;
  bgm = {
    path: neutral.bgm.path,
    volume: neutral.bgm.volume,
    query: neutral.bgm.query ?? null,
    duration_s,
  };
  console.log(`bgm: ${bgm.path}  ${duration_s}s  volume=${bgm.volume}`);
} else {
  console.log("bgm: no completed track found — leaving null");
}

const meta = { bgm, bgm_pending: false, voices, sfx: (neutral.sfx ?? []).map((s) => ({
  frame: Number(s.id), file: s.file, offset_s: s.offset_s ?? 0,
  duration_s: s.duration_s ?? 1, volume: s.volume ?? 0.35,
})) };

writeFileSync(join(root, "audio_meta.json"), JSON.stringify(meta, null, 2));
console.log(`voices: ${voices.length}  total: ${voices.reduce((a, v) => a + (v.duration_s || 0), 0).toFixed(2)}s`);
