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

/**
 * Serialises read-modify-write cycles.
 *
 * Every setter below is a read, a mutation and a write, and they used to run
 * unguarded. Selecting a model fires `saveLastModel` and, now, a recents write
 * in the same tick — and favourites are written from a keypress that can land
 * mid-flight. Two overlapping cycles both read the same document, so the second
 * write lands on stale state and silently drops the first setter's change. The
 * symptom is a preference that reverts on the next launch, which reads like the
 * app ignoring you rather than like a lost update.
 *
 * Chaining on a module-level promise is enough: these are short local file
 * operations, so there is no case for a real lock, and a rejected task must not
 * poison the chain for every later write.
 */
let writeChain = Promise.resolve();

/** Read, mutate and persist preferences without interleaving another writer. */
function updatePrefs(mutator) {
  const run = writeChain.then(async () => {
    const prefs = await ensurePrefs();
    const next = (await mutator(prefs)) ?? prefs;
    await fs.writeFile(PREFS_PATH, JSON.stringify(next, null, 2), { mode: 0o600 });
    return next;
  });
  // Keep the chain alive after a failure, and hand the caller the real result.
  writeChain = run.then(() => {}, () => {});
  return run;
}

export async function saveLastModel(modelId) {
  try {
    await updatePrefs((prefs) => { prefs.lastModel = modelId; });
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
    await updatePrefs((prefs) => { prefs.smallModel = modelId; });
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
    await updatePrefs((prefs) => {
      if (!prefs.modelConfigs) prefs.modelConfigs = {};
      if (!prefs.modelConfigs[provider]) prefs.modelConfigs[provider] = {};
      prefs.modelConfigs[provider][modelId] = config;
    });
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
    await updatePrefs((prefs) => {
      if (!prefs.modelVariants) prefs.modelVariants = {};
      prefs.modelVariants[modelId] = variant;
    });
  } catch {
    // ignore
  }
}

/**
 * Favourited model ids, in the order they were starred.
 *
 * An array rather than a set-shaped object because the order is the only thing
 * that makes the list a ranking, and because `Set` does not survive a JSON
 * round-trip.
 */
export async function loadFavoriteModels() {
  try {
    const prefs = await ensurePrefs();
    const list = prefs.favoriteModels;
    if (!Array.isArray(list)) return [];
    return list.filter((id) => typeof id === 'string' && id);
  } catch {
    return [];
  }
}

/**
 * Star or unstar a model, returning the new list.
 *
 * Read-modify-write goes through the queue like every other setter, so starring
 * two models in quick succession keeps both. The returned value is what the
 * caller should render from — re-reading the file afterwards would be a second
 * source of truth for a value the write just decided.
 */
export async function toggleFavoriteModel(modelId) {
  try {
    const next = await updatePrefs((prefs) => {
      const list = Array.isArray(prefs.favoriteModels)
        ? prefs.favoriteModels.filter((id) => typeof id === 'string' && id)
        : [];
      const at = list.indexOf(modelId);
      if (at >= 0) list.splice(at, 1);
      else list.unshift(modelId);
      prefs.favoriteModels = list;
      return list;
    });
    return next.favoriteModels || [];
  } catch {
    return [];
  }
}

/**
 * Recently used model ids, most recent first.
 *
 * A fixed cap rather than "everything": `f2` steps through this list, so an
 * unbounded one would eventually step through a model the user chose once in
 * March. The cap is small enough that every entry still means something.
 */
export async function loadRecentModels() {
  try {
    const prefs = await ensurePrefs();
    const list = prefs.recentModels;
    if (!Array.isArray(list)) return [];
    return list.filter((id) => typeof id === 'string' && id);
  } catch {
    return [];
  }
}

/**
 * Record a model as just-used.
 *
 * Deduplicated rather than appended: cycling with `f2` would otherwise fill the
 * list with the same three models and push everything else out, so the next
 * `f2` would have nothing new to offer.
 */
export async function recordModelUse(modelId, limit = 10) {
  if (!modelId) return [];
  try {
    const next = await updatePrefs((prefs) => {
      const list = Array.isArray(prefs.recentModels)
        ? prefs.recentModels.filter((id) => typeof id === 'string' && id && id !== modelId)
        : [];
      list.unshift(modelId);
      prefs.recentModels = list.slice(0, limit);
      return prefs.recentModels;
    });
    return next.recentModels || [];
  } catch {
    return [];
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
