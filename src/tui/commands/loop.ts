import type { CommandContext } from './types.js';

export async function handleLoop(ctx: CommandContext) {
  const { args: raw, toast, navigate, submit, setLoopState } = ctx;
  const loopPrompt = raw.trim();
  if (!loopPrompt) { navigate('/loop'); return; }
  const maxIterMatch = loopPrompt.match(/--max-iter\s+(\d+)/i);
  const maxIter = maxIterMatch ? parseInt(maxIterMatch[1], 10) : 20;
  const cleanPrompt = loopPrompt.replace(/--max-iter\s+\d+/i, '').trim();
  toast.info(`Loop started: ${cleanPrompt.slice(0, 60)}... (max ${maxIter} iterations)`);
  setLoopState({ active: true, prompt: cleanPrompt, iterations: 0, maxIterations: maxIter });
  submit(cleanPrompt);
}
