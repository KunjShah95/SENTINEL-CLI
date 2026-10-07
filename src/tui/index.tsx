import './enter-workdir.js';
import { render } from 'ink';
import { App, RENDER_OPTIONS } from './app.js';

// Kick off model discovery in background — replaces the hardcoded model list
// with live data from provider APIs. Falls back gracefully if APIs are down.
import('../shared/models/index.js').then(m => m.refreshModels()).catch(() => {});

try {
  render(<App />, { ...RENDER_OPTIONS });
} catch (e) {
  console.error('Failed to start Sentinel TUI:', e instanceof Error ? e.message : e);
  process.exit(1);
}
