import type { AgentMessage, AgentMode, AgentMessagePart } from '../hooks/use-agent-chat.js';
import type { DialogConfig } from '../providers/dialog/types.js';

export type CommandHandlerResult = void | 'handled';
export type CommandHandler = (ctx: CommandContext) => Promise<CommandHandlerResult>;

export interface CommandContext {
  cmd: string;
  args: string;
  mode: AgentMode;
  model: string;
  messages: AgentMessage[];
  showThinking: boolean;
  showDetails: boolean;
  loading: boolean;
  compacting: boolean;
  sessionId: string | null;
  toast: {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
    warning: (msg: string) => void;
  };
  // The real DialogConfig rather than a hand-copied subset of it: this was an
  // inline structural type, so every option the dialogs gained — `closeOnEscape`
  // among them — was invisible here and every command that passed one failed to
  // typecheck. One type, so the surface cannot drift again.
  dialog: {
    open: (opts: DialogConfig) => void;
    close: () => void;
  };
  appendMessage: (msg: {
    role: 'user' | 'assistant' | 'error';
    mode?: AgentMode;
    model?: string;
    parts: AgentMessagePart[];
  }) => void;
  submit: (prompt: string) => void;
  clear: () => void;
  setMode: (mode: AgentMode) => void;
  setModel: (model: string) => void;
  toggleMode: () => void;
  setShowThinking: (v: boolean) => void;
  setShowDetails: (v: boolean) => void;
  handleExternalEditor: () => Promise<void>;
  handleSelectSession: (id: string) => Promise<void>;
  submitAndWaitForCompaction: (prompt: string) => Promise<any>;
}
