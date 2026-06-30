import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const TRUST_PATH = path.join(os.homedir(), '.sentinel', 'trust-scores.json');

function emptyStore() {
  return { version: 1, models: {} };
}

async function loadStore() {
  try {
    await fs.mkdir(path.dirname(TRUST_PATH), { recursive: true });
    const raw = await fs.readFile(TRUST_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    const store = emptyStore();
    await fs.writeFile(TRUST_PATH, JSON.stringify(store, null, 2));
    return store;
  }
}

async function saveStore(store) {
  await fs.mkdir(path.dirname(TRUST_PATH), { recursive: true });
  await fs.writeFile(TRUST_PATH, JSON.stringify(store, null, 2));
}

function ensureModel(store, modelId) {
  if (!store.models[modelId]) {
    store.models[modelId] = {
      totalIssues: 0,
      confirmed: 0,
      falsePositives: 0,
      unrated: 0,
      avgConfidence: 0,
    };
  }
  return store.models[modelId];
}

function recalcConfidence(model) {
  const rated = model.confirmed + model.falsePositives;
  if (rated === 0) return 0;
  return model.confirmed / rated;
}

let _lastIssueId = 0;
function nextIssueId() {
  return `trust-${Date.now()}-${++_lastIssueId}`;
}

export class TrustScorer {
  constructor(storagePath) {
    this._storagePath = storagePath || TRUST_PATH;
  }

  async recordIssue(issue) {
    const { provenance } = issue;
    if (!provenance || !provenance.modelId) return null;

    const store = await loadStore();
    const model = ensureModel(store, provenance.modelId);
    model.totalIssues++;
    model.unrated++;
    if (provenance.confidence != null) {
      const total = model.totalIssues;
      model.avgConfidence = ((model.avgConfidence * (total - 1)) + provenance.confidence) / total;
    }
    await saveStore(store);

    const issueId = nextIssueId();
    return issueId;
  }

  async recordFeedback(issueId, accurate) {
    const match = issueId.match(/^trust-(\d+)-(\d+)$/);
    if (!match) return false;

    const store = await loadStore();
    for (const modelId of Object.keys(store.models)) {
      const model = store.models[modelId];
      if (model.unrated > 0) {
        if (accurate) model.confirmed++;
        else model.falsePositives++;
        model.unrated--;
        model.avgConfidence = recalcConfidence(model);
        await saveStore(store);
        return true;
      }
    }
    return false;
  }

  async getModelScore(modelId) {
    const store = await loadStore();
    const m = store.models[modelId];
    if (!m) return null;
    const rated = m.confirmed + m.falsePositives;
    return {
      totalIssues: m.totalIssues,
      confirmed: m.confirmed,
      falsePositives: m.falsePositives,
      unrated: m.unrated,
      avgConfidence: m.avgConfidence,
      fpRate: rated > 0 ? m.falsePositives / rated : 0,
      accuracy: rated > 0 ? m.confirmed / rated : 0,
    };
  }

  async getProviderScore(provider) {
    const store = await loadStore();
    const models = Object.entries(store.models)
      .filter(([id]) => id.startsWith(`${provider}/`) || id.startsWith(`${provider}:`));
    if (models.length === 0) return null;

    const agg = { totalIssues: 0, confirmed: 0, falsePositives: 0, unrated: 0, modelCount: 0 };
    for (const [, m] of models) {
      agg.totalIssues += m.totalIssues;
      agg.confirmed += m.confirmed;
      agg.falsePositives += m.falsePositives;
      agg.unrated += m.unrated;
      agg.modelCount++;
    }
    const rated = agg.confirmed + agg.falsePositives;
    agg.fpRate = rated > 0 ? agg.falsePositives / rated : 0;
    agg.accuracy = rated > 0 ? agg.confirmed / rated : 0;
    return agg;
  }

  async getRankedProviders() {
    const store = await loadStore();
    const providers = {};
    for (const [modelId] of Object.entries(store.models)) {
      const provider = modelId.includes('/') ? modelId.split('/')[0] : modelId.includes(':') ? modelId.split(':')[0] : modelId;
      if (!providers[provider]) providers[provider] = { totalIssues: 0, confirmed: 0, falsePositives: 0, unrated: 0, models: [] };
      const m = store.models[modelId];
      providers[provider].totalIssues += m.totalIssues;
      providers[provider].confirmed += m.confirmed;
      providers[provider].falsePositives += m.falsePositives;
      providers[provider].unrated += m.unrated;
      providers[provider].models.push(modelId);
    }
    return Object.entries(providers)
      .map(([provider, data]) => {
        const rated = data.confirmed + data.falsePositives;
        data.fpRate = rated > 0 ? data.falsePositives / rated : 0;
        data.accuracy = rated > 0 ? data.confirmed / rated : 0;
        data.provider = provider;
        return data;
      })
      .sort((a, b) => a.fpRate - b.fpRate || b.totalIssues - a.totalIssues);
  }

  async getStats() {
    const store = await loadStore();
    const models = Object.entries(store.models).map(([id, m]) => {
      const rated = m.confirmed + m.falsePositives;
      return {
        modelId: id,
        totalIssues: m.totalIssues,
        confirmed: m.confirmed,
        falsePositives: m.falsePositives,
        unrated: m.unrated,
        avgConfidence: m.avgConfidence,
        fpRate: rated > 0 ? m.falsePositives / rated : 0,
        accuracy: rated > 0 ? m.confirmed / rated : 0,
      };
    });
    models.sort((a, b) => a.fpRate - b.fpRate || b.totalIssues - a.totalIssues);
    return { version: store.version, models };
  }
}
