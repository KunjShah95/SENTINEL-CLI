/**
 * Shared package — schemas, tool contracts, and model registry shared between
 * the Sentinel CLI and the Hono API server.
 *
 * Mirrors the layout used by the Nightcode project (https://github.com/code-with-antonio/nightcode)
 * so that the same `tool()` definitions and `InferUITools<ToolContracts>` types
 * work on both sides of the network.
 */

export { Mode, modeSchema, isReadOnlyTool } from './schemas/mode.js';
export {
  toolInputSchemas,
  readOnlyToolContracts,
  buildToolContracts,
  getToolContracts,
  READ_ONLY_TOOL_NAMES,
  BUILD_TOOL_NAMES,
  executeLocalTool,
  resolveInsideCwd,
  truncate,
  getToolNames,
  MAX_FILE_SIZE,
  MAX_RESULTS,
  MAX_MATCHES,
  MAX_OUTPUT,
  DEFAULT_TIMEOUT,
} from './tools/index.js';

export {
  SUPPORTED_CHAT_MODELS,
  DEFAULT_CHAT_MODEL_ID,
  findSupportedChatModel,
  isSupportedChatModel,
  resolveChatModel,
  getModelPricing,
  estimateCostUsd,
  convertUsdToCredits,
  calculateCreditsForUsage,
  USD_PER_CREDIT,
  SupportedProvider,
  refreshModels,
  invalidateModelCache,
} from './models/index.js';

export {
  createSessionSchema,
  submitSchema,
  newSessionStateSchema,
  ChatMessageMetadata,
} from './schemas/index.js';
