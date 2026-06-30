import type { AgentMessage, AgentMode } from '../hooks/use-agent-chat.js';

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
  navigate: (path: string) => void;
  toast: {
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
    warning: (msg: string) => void;
  };
  dialog: {
    open: (opts: { title: string; width?: number; height?: number; children: any }) => void;
    close: () => void;
  };
  appendMessage: (msg: {
    role: 'user' | 'assistant' | 'error';
    mode?: AgentMode;
    model?: string;
    parts: { type: string; text?: string; [key: string]: any }[];
  }) => void;
  submit: (prompt: string) => void;
  clear: () => void;
  setMode: (mode: AgentMode) => void;
  setModel: (model: string) => void;
  toggleMode: () => void;
  setShowThinking: (v: boolean) => void;
  setShowDetails: (v: boolean) => void;
  setLoopState: (state: {
    active: boolean;
    prompt: string;
    iterations: number;
    maxIterations: number;
  }) => void;
  handleExternalEditor: () => Promise<void>;
  handleSelectSession: (id: string) => Promise<void>;
  submitAndWaitForCompaction: (prompt: string) => Promise<any>;
}
