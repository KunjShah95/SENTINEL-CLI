/**
 * Local tool execution for the TUI — thin wrapper around
 * `src/shared/tools` that runs in the same process as the OpenTUI
 * renderer. The TUI uses the new client-side tool execution model
 * (mirroring Nightcode's local-tools.ts).
 *
 * Each tool call returns a Promise<unknown> with the result the server
 * expects; PLAN mode blocks write/edit/bash.
 */
import { executeLocalTool, getToolNames, getToolContracts, Mode, isReadOnlyTool, MAX_FILE_SIZE } from '../../shared/index.js';
export { Mode, isReadOnlyTool, getToolNames, getToolContracts, executeLocalTool, MAX_FILE_SIZE };
/**
 * Run a tool call requested by the server. Mirrors `executeLocalTool`
 * semantics — PLAN mode refuses to write.
 */
export async function runLocalTool(toolName, input, mode) {
  if (mode === Mode.PLAN && !isReadOnlyTool(toolName)) {
    return {
      error: `Tool ${toolName} is not available in PLAN mode. Switch to BUILD mode to make changes.`,
    };
  }
  try {
    return await executeLocalTool(toolName, input, mode);
  }
  catch (e) {
    return { error: e?.message || String(e) };
  }
}
