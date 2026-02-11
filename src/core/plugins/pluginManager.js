import { readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import EventBus from '../events/eventBus.js';
import { LifecyclePhase, EventType } from '../../interfaces/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class PluginManager {
  constructor(options = {}) {
    this.plugins = new Map();
    this.pluginPath = options.pluginPath || path.join(__dirname, '../../../plugins');
    this.eventBus = options.eventBus || new EventBus();
    this.hooks = new Map();
    this.isInitialized = false;
    this.pluginMetrics = {
      loaded: 0,
      failed: 0,
      totalLoadTime: 0,
    };
  }

  async discoverAndLoad(pluginPatterns = []) {
    const patterns = pluginPatterns.length > 0
      ? pluginPatterns
      : ['**/*.plugin.js', '**/*.plugin.mjs'];

    const plugins = [];

    for (const pattern of patterns) {
      const patternPath = path.isAbsolute(pattern)
        ? pattern
        : path.join(this.pluginPath, pattern);

      try {
        const files = await this.glob(patternPath);
        for (const file of files) {
          const plugin = await this.loadPlugin(file);
          if (plugin) {
            plugins.push(plugin);
          }
        }
      } catch (error) {
        console.warn(`Failed to discover plugins for pattern ${pattern}:`, error.message);
      }
    }

    return plugins;
  }

  async loadPlugin(pluginPath) {
    try {
      const startTime = Date.now();
      const module = await import(`file://${pluginPath}`);

      if (!module.default) {
        throw new Error('Plugin must export a default class');
      }

      const PluginClass = module.default;
      const pluginInstance = new PluginClass({
        path: pluginPath,
        eventBus: this.eventBus,
        packagePath: path.join(pluginPath, 'package.json'),
      });

      if (typeof pluginInstance.getName !== 'function') {
        throw new Error('Plugin must implement getName()');
      }

      const pluginName = pluginInstance.getName();

      if (this.plugins.has(pluginName)) {
        throw new Error(`Plugin ${pluginName} is already loaded`);
      }

      await pluginInstance.initialize();
      this.plugins.set(pluginName, pluginInstance);

      this.registerPluginHooks(pluginInstance);
      this.registerPluginEvents(pluginInstance);

      this.pluginMetrics.loaded++;
      this.pluginMetrics.totalLoadTime += Date.now() - startTime;

      this.eventBus.emit(EventType.PLUGIN_LOADED, {
        name: pluginName,
        version: pluginInstance.version || 'unknown',
        path: pluginPath,
      });

      console.log(`✓ Plugin loaded: ${pluginName}`);
      return pluginInstance;
    } catch (error) {
      this.pluginMetrics.failed++;
      this.eventBus.emit(EventType.PLUGIN_ERROR, {
        path: pluginPath,
        error: error.message,
      });
      console.error(`Failed to load plugin ${pluginPath}:`, error.message);
      return null;
    }
  }

  registerPluginHooks(plugin) {
    if (typeof plugin.getHooks === 'function') {
      const pluginHooks = plugin.getHooks();
      for (const hook of pluginHooks) {
        this.registerHook(plugin.name, hook);
      }
    }
  }

  registerPluginEvents(plugin) {
    if (typeof plugin.getEventSubscriptions === 'function') {
      const subscriptions = plugin.getEventSubscriptions();
      for (const sub of subscriptions) {
        this.eventBus.on(sub.event, sub.handler, sub.options);
      }
    }
  }

  registerHook(pluginName, hook) {
    if (!hook.type || !hook.handler) {
      console.warn(`Invalid hook from plugin ${pluginName}: missing type or handler`);
      return;
    }

    const hookId = `${pluginName}:${hook.type}`;

    if (this.hooks.has(hookId)) {
      console.warn(`Hook ${hookId} already registered, overwriting`);
    }

    this.hooks.set(hookId, {
      ...hook,
      pluginName,
      registeredAt: Date.now(),
    });

    this.eventBus.on(hook.type, hook.handler, hook.options);
  }

  async executeHook(hookType, context = {}) {
    const hookEntries = Array.from(this.hooks.entries())
      .filter(([key]) => key.endsWith(`:${hookType}`))
      .map(([_, hook]) => hook);

    const results = [];

    for (const hook of hookEntries) {
      try {
        if (typeof hook.condition === 'function' && !hook.condition(context)) {
          continue;
        }

        const result = await hook.handler(context);

        results.push({
          hookId: `${hook.pluginName}:${hook.type}`,
          success: true,
          result,
        });
      } catch (error) {
        results.push({
          hookId: `${hook.pluginName}:${hook.type}`,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  async initializePlugins(phase = LifecyclePhase.INITIALIZE) {
    const initializers = [];

    for (const [name, plugin] of this.plugins) {
      if (typeof plugin.initialize === 'function') {
        initializers.push(
          (async () => {
            try {
              await plugin.initialize({ phase, eventBus: this.eventBus });
            } catch (error) {
              console.error(`Failed to initialize plugin ${name}:`, error.message);
            }
          })()
        );
      }
    }

    await Promise.allSettled(initializers);
    this.isInitialized = true;
  }

  async configurePlugins(config = {}) {
    for (const [name, plugin] of this.plugins) {
      if (typeof plugin.configure === 'function') {
        try {
          const pluginConfig = config[name] || {};
          await plugin.configure(pluginConfig);
        } catch (error) {
          console.error(`Failed to configure plugin ${name}:`, error.message);
        }
      }
    }
  }

  async cleanupPlugins() {
    for (const [name, plugin] of this.plugins) {
      if (typeof plugin.cleanup === 'function') {
        try {
          await plugin.cleanup();
        } catch (error) {
          console.error(`Failed to cleanup plugin ${name}:`, error.message);
        }
      }
    }

    this.plugins.clear();
    this.hooks.clear();
    this.isInitialized = false;
  }

  getPlugin(name) {
    return this.plugins.get(name) || null;
  }

  getAllPlugins() {
    return Array.from(this.plugins.values());
  }

  getPluginMetrics() {
    return {
      ...this.pluginMetrics,
      averageLoadTime: this.pluginMetrics.loaded > 0
        ? this.pluginMetrics.totalLoadTime / this.pluginMetrics.loaded
        : 0,
      plugins: Array.from(this.plugins.entries()).map(([name, plugin]) => ({
        name,
        version: plugin.version || 'unknown',
        hooks: Array.from(this.hooks.entries())
          .filter(([_, hook]) => hook.pluginName === name)
          .length,
      })),
    };
  }

  async glob(pattern) {
    const results = [];
    const patternDir = path.dirname(pattern);
    const patternBase = path.basename(pattern);

    try {
      const entries = await readdir(patternDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(patternDir, entry.name);
        const matches = this.matchPattern(patternBase, entry.name);

        if (matches && entry.isFile()) {
          results.push(fullPath);
        }

        if (entry.isDirectory() && patternBase.includes('**')) {
          const subResults = await this.glob(
            pattern.replace('**', entry.name)
          );
          results.push(...subResults);
        }
      }
    } catch {
      return [];
    }

    return results;
  }

  matchPattern(pattern, filename) {
    if (pattern === filename) return true;

    if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1);
      return filename.endsWith(ext);
    }

    if (pattern.includes('**')) {
      return true;
    }

    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\*/g, '.*') + '$'
      );
      return regex.test(filename);
    }

    return false;
  }

  createPluginTemplate(name, version = '1.0.0') {
    return `import { AnalyzerPhase, HookType, EventType } from '../interfaces/index.js';

export default class ${name}Plugin {
  constructor(options = {}) {
    this.name = '${name}';
    this.version = '${version}';
    this.options = options;
    this.eventBus = options.eventBus;
    this.isEnabled = true;
  }

  getName() {
    return this.name;
  }

  getVersion() {
    return this.version;
  }

  async initialize(context = {}) {
    console.log('Initializing ${name} plugin...');
    return true;
  }

  async configure(config = {}) {
    this.isEnabled = config.enabled !== false;
    return true;
  }

  async cleanup() {
    console.log('Cleaning up ${name} plugin...');
    return true;
  }

  getHooks() {
    return [
      {
        type: HookType.BEFORE_ANALYZE,
        handler: this.onBeforeAnalyze.bind(this),
        priority: 100,
      },
      {
        type: HookType.AFTER_ANALYZE,
        handler: this.onAfterAnalyze.bind(this),
        priority: 100,
      },
    ];
  }

  getEventSubscriptions() {
    return [
      {
        event: EventType.SCAN_START,
        handler: this.onScanStart.bind(this),
      },
      {
        event: EventType.SCAN_COMPLETE,
        handler: this.onScanComplete.bind(this),
      },
    ];
  }

  async onBeforeAnalyze(context) {
    console.log('Before analyze hook triggered');
    return context;
  }

  async onAfterAnalyze(context) {
    console.log('After analyze hook triggered');
    return context;
  }

  async onScanStart(data) {
    console.log('Scan started:', data);
  }

  async onScanComplete(data) {
    console.log('Scan completed:', data);
  }
}
`;
  }
}

export default PluginManager;
