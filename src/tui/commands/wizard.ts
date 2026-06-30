import type { CommandContext } from './types.js';

export async function handleWizard(ctx: CommandContext) {
  const { dialog, appendMessage, mode, model } = ctx;
  const React = await import('react');
  const { MultiStepAnalyzeDialog } = await import('../components/dialogs/multi-step-analyze.js');
  dialog.open({
    title: 'Multi-Step Analysis Wizard',
    width: 70,
    height: 35,
    children: React.createElement(MultiStepAnalyzeDialog, {
      onRun: async (target: string, analyzers: string[]) => {
        appendMessage({ role: 'user', mode, model, parts: [{ type: 'text', text: `/analyze ${target} (analyzers: ${analyzers.join(', ')})` }] });
        try {
          const { TOOLS } = await import('../lib/tools.js');
          const result = await TOOLS.analyze.execute({ files: target });
          if (result.output) { appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: result.output }] }); }
          else { appendMessage({ role: 'error', parts: [{ type: 'text', text: result.error || 'Analysis failed' }] }); }
        } catch (e) { appendMessage({ role: 'error', parts: [{ type: 'text', text: String(e) }] }); }
      },
    }),
  });
}
