let active = false;
let providers = [];
let currentIndex = -1;
export function isAuthPending() {
    return active;
}
export function getCurrentProvider() {
    if (!active || currentIndex < 0 || currentIndex >= providers.length)
        return null;
    return providers[currentIndex];
}
export function getProgress() {
    return `[${currentIndex + 1}/${providers.length}]`;
}
export function getRemainingCount() {
    return providers.length - currentIndex - 1;
}
export function startAuthWizard() {
    active = true;
    currentIndex = 0;
    providers = [];
    return 'Loading provider configuration...';
}
export async function initializeProviders() {
    const { Config } = await import('../../config/config.js');
    const config = new Config();
    await config.load();
    const { configManager } = await import('../../config/configManager.js');
    await configManager.load();
    const defined = config.get('ai.providers', []);
    const missing = [];
    for (const p of defined) {
        if (p.provider === 'local' || p.provider === 'ollama')
            continue;
        const stored = configManager.getApiKey(p.provider);
        const envKey = p.apiKeyEnv || '';
        if (!stored && !process.env[envKey]) {
            missing.push({ name: p.provider, label: `${p.provider} (${p.model})` });
        }
    }
    if (missing.length === 0) {
        active = false;
        return 'All AI providers already configured. Run `/auth` to see status.';
    }
    providers = missing;
    currentIndex = 0;
    const first = providers[0];
    let msg = 'AI Provider Setup\n';
    msg += '────────────────────────────────\n';
    msg += `Enter your API key for **${first.label}**\n`;
    msg += 'Type/paste the key and press Enter.\n';
    msg += 'Type `skip` to skip this provider, `done` to finish.\n';
    return msg;
}
export async function handleAuthInput(key) {
    if (!active || currentIndex < 0 || currentIndex >= providers.length) {
        active = false;
        return '(no pending auth)';
    }
    const { configManager } = await import('../../config/configManager.js');
    await configManager.load();
    const current = providers[currentIndex];
    const trimmed = key.trim();
    if (trimmed.toLowerCase() === 'done') {
        active = false;
        let msg = 'Setup complete.\n';
        msg += `Configured ${currentIndex} of ${providers.length} providers.\n`;
        msg += 'Run `/auth` to see current status.';
        return msg;
    }
    if (trimmed.toLowerCase() === 'skip') {
        currentIndex++;
        if (currentIndex >= providers.length) {
            active = false;
            return 'All providers processed. Run `/auth` to see current status.';
        }
        const next = providers[currentIndex];
        return `Skipped ${current.label}.\n\nEnter API key for **${next.label}** (or \`skip\`/\`done\`):`;
    }
    if (trimmed.length < 8) {
        return `Key too short (${trimmed.length} chars). Enter a valid API key for **${current.label}** (or \`skip\`/\`done\`):`;
    }
    try {
        await configManager.setApiKey(current.name, trimmed);
        configManager.injectEnvVars();
    }
    catch (e) {
        return `Error saving key for ${current.label}: ${e}\n\nTry again or type \`skip\`:`;
    }
    currentIndex++;
    if (currentIndex >= providers.length) {
        active = false;
        return `✓ **${current.label}** configured.\n\nAll providers set up! Run \`/auth\` to verify.`;
    }
    const next = providers[currentIndex];
    return `✓ **${current.label}** configured.\n\nEnter API key for **${next.label}** (or \`skip\`/\`done\`):`;
}
export function cancelAuth() {
    active = false;
    providers = [];
    currentIndex = -1;
}
