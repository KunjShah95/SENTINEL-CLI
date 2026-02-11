import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Settings,
    Key,
    Terminal,
    Cpu,
    Shield,
    Database,
    Save,
    Eye,
    EyeOff,
    Server,
    Code,
    Terminal as ShellIcon
} from 'lucide-react';

interface ConfigState {
    data: {
        directory: string;
    };
    providers: {
        openai: { apiKey: string; disabled: boolean };
        anthropic: { apiKey: string; disabled: boolean };
        gemini: { apiKey: string; disabled: boolean };
        copilot: { disabled: boolean };
        groq: { apiKey: string; disabled: boolean };
        openrouter: { apiKey: string; disabled: boolean };
    };
    agents: {
        coder: { model: string; maxTokens: number };
        task: { model: string; maxTokens: number };
        title: { model: string; maxTokens: number };
    };
    shell: {
        path: string;
        args: string[];
    };
    debug: boolean;
    autoCompact: boolean;
}

export const Config: React.FC = () => {
    const [activeTab, setActiveTab] = useState('providers');
    const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(false);
    const [saved, setSaved] = useState(false);

    const [config, setConfig] = useState<ConfigState>({
        data: { directory: '.sentinel' },
        providers: {
            openai: { apiKey: '', disabled: false },
            anthropic: { apiKey: '', disabled: false },
            gemini: { apiKey: '', disabled: false },
            copilot: { disabled: true },
            groq: { apiKey: '', disabled: false },
            openrouter: { apiKey: '', disabled: false }
        },
        agents: {
            coder: { model: 'gpt-4o-mini', maxTokens: 5000 },
            task: { model: 'claude-3-5-sonnet-20241022', maxTokens: 5000 },
            title: { model: 'gpt-4o-mini', maxTokens: 80 }
        },
        shell: { path: '/bin/bash', args: ['-l'] },
        debug: false,
        autoCompact: true
    });

    useEffect(() => {
        // Load config from local API if available
        const loadConfig = async () => {
            try {
                const response = await fetch('/api/config');
                if (response.ok) {
                    const data = await response.json();
                    setConfig(prev => ({ ...prev, ...data }));
                }
            } catch (err) {
                console.log('Local API not available, using default config or localStorage');
                const savedConfig = localStorage.getItem('sentinel_config');
                if (savedConfig) {
                    setConfig(JSON.parse(savedConfig));
                }
            }
        };
        loadConfig();
    }, []);

    const handleSave = async () => {
        setLoading(true);
        try {
            // Try to save to local API
            const response = await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            if (!response.ok) throw new Error('API save failed');

            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            // Fallback to localStorage
            localStorage.setItem('sentinel_config', JSON.stringify(config));
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } finally {
            setLoading(false);
        }
    };

    const toggleKey = (provider: string) => {
        setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
    };

    const updateProvider = (provider: string, field: string, value: any) => {
        setConfig(prev => ({
            ...prev,
            providers: {
                ...prev.providers,
                [provider]: {
                    ...(prev.providers as any)[provider],
                    [field]: value
                }
            }
        }));
    };

    const updateAgent = (agent: string, field: string, value: any) => {
        setConfig(prev => ({
            ...prev,
            agents: {
                ...prev.agents,
                [agent]: {
                    ...(prev.agents as any)[agent],
                    [field]: value
                }
            }
        }));
    };

    const TabButton = ({ id, icon: Icon, label }: { id: string, icon: any, label: string }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all ${activeTab === id
                ? 'bg-[var(--color-sentinel)]/20 text-[var(--color-sentinel)] border border-[var(--color-sentinel)]/30'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-void-surface)]'
                }`}
        >
            <Icon size={18} />
            <span className="font-medium">{label}</span>
        </button>
    );

    return (
        <div className="pt-24 pb-12 px-4 max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-[var(--color-text-primary)] to-[var(--color-text-muted)] bg-clip-text text-transparent flex items-center gap-3 font-['Syne']">
                        <Settings className="text-[var(--color-sentinel)]" /> Sentinel Configuration
                    </h1>
                    <p className="text-[var(--color-text-secondary)] mt-2">Manage your AI providers, agents, and system settings.</p>
                </div>

                <button
                    onClick={handleSave}
                    disabled={loading}
                    className={`flex items-center space-x-2 px-6 py-2.5 rounded-full font-semibold transition-all ${saved
                        ? 'bg-[var(--color-sentinel)] text-[var(--color-void)]'
                        : 'bg-[var(--color-sentinel)] hover:brightness-110 text-[var(--color-void)] shadow-lg shadow-[var(--color-sentinel)]/20'
                        }`}
                >
                    {loading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : saved ? (
                        <>
                            <Shield size={18} />
                            <span>Config Saved!</span>
                        </>
                    ) : (
                        <>
                            <Save size={18} />
                            <span>Save Configuration</span>
                        </>
                    )}
                </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-8 p-1 bg-[var(--color-void-surface)] rounded-xl border border-[var(--color-border-subtle)] w-fit">
                <TabButton id="providers" icon={Key} label="AI Providers" />
                <TabButton id="agents" icon={Cpu} label="Agents" />
                <TabButton id="system" icon={Terminal} label="System" />
                <TabButton id="advanced" icon={Shield} label="Advanced" />
            </div>

            <div className="grid grid-cols-1 gap-6">
                {activeTab === 'providers' && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid grid-cols-1 md:grid-cols-2 gap-6"
                    >
                        {['openai', 'anthropic', 'gemini', 'groq', 'openrouter'].map((p) => (
                            <div key={p} className="p-6 rounded-2xl bg-[var(--color-void-surface)] border border-[var(--color-border-subtle)] hover:border-[var(--color-sentinel)]/30 transition-all backdrop-blur-sm">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-[var(--color-sentinel)]/10 flex items-center justify-center">
                                            <Key className="text-[var(--color-sentinel)]" size={20} />
                                        </div>
                                        <h3 className="font-bold text-lg capitalize text-[var(--color-text-primary)]">{p}</h3>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            checked={!(config.providers as any)[p].disabled}
                                            onChange={(e) => updateProvider(p, 'disabled', !e.target.checked)}
                                        />
                                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                    </label>
                                </div>

                                <div className="relative">
                                    <input
                                        type={showKeys[p] ? 'text' : 'password'}
                                        value={(config.providers as any)[p].apiKey}
                                        onChange={(e) => updateProvider(p, 'apiKey', e.target.value)}
                                        placeholder={`Enter ${p} API Key`}
                                        className="w-full bg-[var(--color-void-deep)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] rounded-lg py-2.5 pl-4 pr-10 focus:outline-none focus:border-[var(--color-sentinel)]/50 transition-all font-mono text-sm placeholder-[var(--color-text-tertiary)]"
                                    />
                                    <button
                                        onClick={() => toggleKey(p)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)]"
                                    >
                                        {showKeys[p] ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>
                        ))}

                        <div className="p-6 rounded-2xl bg-[var(--color-void-surface)] border border-[var(--color-border-subtle)] hover:border-[var(--color-sentinel)]/30 transition-all backdrop-blur-sm">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-[var(--color-sentinel)]/10 flex items-center justify-center">
                                        <Shield className="text-[var(--color-sentinel)]" size={20} />
                                    </div>
                                    <h3 className="font-bold text-lg text-[var(--color-text-primary)]">GitHub Copilot</h3>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={!config.providers.copilot.disabled}
                                        onChange={(e) => updateProvider('copilot', 'disabled', !e.target.checked)}
                                    />
                                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>
                            <p className="text-sm text-gray-400">Uses your local GitHub Copilot authentication. No API key required.</p>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'agents' && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="grid grid-cols-1 md:grid-cols-3 gap-6"
                    >
                        {['coder', 'task', 'title'].map((a) => (
                            <div key={a} className="p-6 rounded-2xl bg-[var(--color-void-surface)] border border-[var(--color-border-subtle)] hover:border-[var(--color-sentinel)]/30 transition-all">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-lg bg-[var(--color-scan)]/10 flex items-center justify-center">
                                        <Cpu className="text-[var(--color-scan)]" size={20} />
                                    </div>
                                    <h3 className="font-bold text-lg capitalize text-[var(--color-text-primary)]">{a} Agent</h3>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1.5 ml-1">Model</label>
                                        <input
                                            type="text"
                                            value={(config.agents as any)[a].model}
                                            onChange={(e) => updateAgent(a, 'model', e.target.value)}
                                            className="w-full bg-[var(--color-void-deep)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] rounded-lg py-2 px-3 focus:outline-none focus:border-[var(--color-sentinel)]/50 transition-all text-sm font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1.5 ml-1">Max Tokens</label>
                                        <input
                                            type="number"
                                            value={(config.agents as any)[a].maxTokens}
                                            onChange={(e) => updateAgent(a, 'maxTokens', parseInt(e.target.value))}
                                            className="w-full bg-[var(--color-void-deep)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] rounded-lg py-2 px-3 focus:outline-none focus:border-[var(--color-sentinel)]/50 transition-all text-sm font-mono"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </motion.div>
                )}

                {activeTab === 'system' && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        <div className="p-6 rounded-2xl bg-[var(--color-void-surface)] border border-[var(--color-border-subtle)]">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-[var(--color-text-primary)]">
                                <ShellIcon className="text-[var(--color-text-secondary)]" size={20} /> Shell Settings
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1.5 ml-1">Shell Path</label>
                                    <input
                                        type="text"
                                        value={config.shell.path}
                                        onChange={(e) => setConfig(prev => ({ ...prev, shell: { ...prev.shell, path: e.target.value } }))}
                                        className="w-full bg-[var(--color-void-deep)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] rounded-lg py-2.5 px-4 focus:outline-none focus:border-[var(--color-sentinel)]/50 transition-all font-mono text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1.5 ml-1">Arguments (comma separated)</label>
                                    <input
                                        type="text"
                                        value={config.shell.args.join(', ')}
                                        onChange={(e) => setConfig(prev => ({ ...prev, shell: { ...prev.shell, args: e.target.value.split(',').map(s => s.trim()) } }))}
                                        className="w-full bg-[var(--color-void-deep)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] rounded-lg py-2.5 px-4 focus:outline-none focus:border-[var(--color-sentinel)]/50 transition-all font-mono text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-6 rounded-2xl bg-[var(--color-void-surface)] border border-[var(--color-border-subtle)]">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-[var(--color-text-primary)]">
                                <Database className="text-[var(--color-text-secondary)]" size={20} /> Data Directory
                            </h3>
                            <div>
                                <label className="block text-xs font-semibold text-[var(--color-text-tertiary)] uppercase mb-1.5 ml-1">Directory Name</label>
                                <input
                                    type="text"
                                    value={config.data.directory}
                                    onChange={(e) => setConfig(prev => ({ ...prev, data: { ...prev.data, directory: e.target.value } }))}
                                    className="w-full bg-[var(--color-void-deep)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)] rounded-lg py-2.5 px-4 focus:outline-none focus:border-[var(--color-sentinel)]/50 transition-all font-mono text-sm"
                                />
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'advanced' && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                    >
                        <div className="p-6 rounded-2xl bg-[var(--color-void-surface)] border border-[var(--color-border-subtle)] flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-lg text-[var(--color-text-primary)]">Debug Mode</h3>
                                <p className="text-[var(--color-text-tertiary)] text-sm">Enable verbose logging and stack traces for troubleshooting.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={config.debug}
                                    onChange={(e) => setConfig(prev => ({ ...prev, debug: e.target.checked }))}
                                />
                                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div className="p-6 rounded-2xl bg-[var(--color-void-surface)] border border-[var(--color-border-subtle)] flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-lg text-[var(--color-text-primary)]">Auto Compact</h3>
                                <p className="text-[var(--color-text-tertiary)] text-sm">Automatically compact history and cache periodically.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={config.autoCompact}
                                    onChange={(e) => setConfig(prev => ({ ...prev, autoCompact: e.target.checked }))}
                                />
                                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div className="mt-8 p-4 rounded-xl bg-[var(--color-sentinel)]/10 border border-[var(--color-sentinel)]/20 text-[var(--color-sentinel)] flex gap-3">
                            <Shield size={20} className="shrink-0" />
                            <p className="text-sm">
                                <strong>Security:</strong> API keys are stored locally on your system in <code>.sentinel.json</code> (Home directory or local project).
                                They are never transmitted to our servers.
                            </p>
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
};
