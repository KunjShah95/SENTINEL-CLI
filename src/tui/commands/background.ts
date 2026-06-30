import type { CommandContext } from './types.js';

export async function handleBackground(ctx: CommandContext) {
  const { args: raw, toast, appendMessage, mode, model } = ctx;
  const prompt = raw.trim();
  if (!prompt) { toast.error('Usage: /background <prompt>'); return; }
  try {
    const { launchBackgroundAgent } = await import('../../agents/background-agent.js');
    const agent = launchBackgroundAgent(prompt);
    toast.success(`Background agent launched: ${agent.id}`);
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `🚀 Background agent \`${agent.id}\` started.\nPrompt: "${prompt.slice(0, 80)}"\nCheck status with /agents` }] });
  } catch (e) { toast.error('Failed to launch agent: ' + String(e)); }
}

export async function handleAgents(ctx: CommandContext) {
  const { toast, appendMessage, mode, model } = ctx;
  try {
    const { listAgents } = await import('../../agents/background-agent.js');
    const agents = listAgents();
    if (agents.length === 0) { toast.info('No background agents running.'); return; }
    const lines = agents.map((a: any) => `• ${a.id} — ${a.status} (${a.elapsed}) — "${a.prompt}"`).join('\n');
    appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: `**Background Agents:**\n${lines}` }] });
  } catch (e) { toast.error('Failed to list agents: ' + String(e)); }
}
