import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const PREFS_DIR = path.join(os.homedir(), '.sentinel');
const PREFS_PATH = path.join(PREFS_DIR, 'preferences.json');

async function ensurePrefs() {
  try {
    await fs.mkdir(PREFS_DIR, { recursive: true });
    try {
      const raw = await fs.readFile(PREFS_PATH, 'utf8');
      return JSON.parse(raw);
    } catch {
      const defaults = {
        lastModel: '',
        smallModel: '',
        theme: 'default',
        modelConfigs: {},
      };
      await fs.writeFile(PREFS_PATH, JSON.stringify(defaults, null, 2), { mode: 0o600 });
      return defaults;
    }
  } catch {
    return {};
  }
}

export async function saveLastModel(modelId) {
  try {
    const prefs = await ensurePrefs();
    prefs.lastModel = modelId;
    await fs.writeFile(PREFS_PATH, JSON.stringify(prefs, null, 2), { mode: 0o600 });
  } catch {
    // ignore
  }
}

export async function loadLastModel() {
  try {
    const prefs = await ensurePrefs();
    return prefs.lastModel || '';
  } catch {
    return '';
  }
}

export async function saveSmallModel(modelId) {
  try {
    const prefs = await ensurePrefs();
    prefs.smallModel = modelId;
    await fs.writeFile(PREFS_PATH, JSON.stringify(prefs, null, 2), { mode: 0o600 });
  } catch {
    // ignore
  }
}

export async function loadSmallModel() {
  try {
    const prefs = await ensurePrefs();
    return prefs.smallModel || '';
  } catch {
    return '';
  }
}

export async function saveModelConfig(provider, modelId, config) {
  try {
    const prefs = await ensurePrefs();
    if (!prefs.modelConfigs) prefs.modelConfigs = {};
    if (!prefs.modelConfigs[provider]) prefs.modelConfigs[provider] = {};
    prefs.modelConfigs[provider][modelId] = config;
    await fs.writeFile(PREFS_PATH, JSON.stringify(prefs, null, 2), { mode: 0o600 });
  } catch {
    // ignore
  }
}

export async function loadModelConfig(provider, modelId) {
  try {
    const prefs = await ensurePrefs();
    return prefs.modelConfigs?.[provider]?.[modelId] || null;
  } catch {
    return null;
  }
}

export async function getAllModelConfigs() {
  try {
    const prefs = await ensurePrefs();
    return prefs.modelConfigs || {};
  } catch {
    return {};
  }
}

/**
 * Per-model reasoning effort, kept in its own map rather than stuffed into
 * `modelConfigs`.
 *
 * `modelConfigs` is keyed by connector then model id and holds request options
 * — the same slot is what `applyModelOverrides` reads. Putting a UI preference
 * there would make an unknown key in that map ambiguous between "an option I
 * should merge into the request" and "a level the user picked", and one wrong
 * merge would send a display setting to the provider.
 */
export async function saveModelVariant(modelId, variant) {
  try {
    const prefs = await ensurePrefs();
    if (!prefs.modelVariants) prefs.modelVariants = {};
    prefs.modelVariants[modelId] = variant;
    await fs.writeFile(PREFS_PATH, JSON.stringify(prefs, null, 2), { mode: 0o600 });
  } catch {
    // ignore
  }
}

export async function loadModelVariant(modelId) {
  try {
    const prefs = await ensurePrefs();
    return prefs.modelVariants?.[modelId] || null;
  } catch {
    return null;
  }
}

export async function getAllModelVariants() {
  try {
    const prefs = await ensurePrefs();
    return prefs.modelVariants || {};
  } catch {
    return {};
  }
}
