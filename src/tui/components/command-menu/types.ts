export type CommandContext = {
  exit: () => void;
  navigate: (path: string) => void;
  execute: (action: string, args?: Record<string, unknown>) => void;
  mode: "BUILD" | "PLAN" | "REVIEW" | "SCAN" | "FIX";
  setMode: (mode: "BUILD" | "PLAN" | "REVIEW" | "SCAN" | "FIX") => void;
};

export type Command = {
  name: string;
  description: string;
  value: string;
  category?: string;
  action?: (ctx: CommandContext) => void | Promise<void>;
};
