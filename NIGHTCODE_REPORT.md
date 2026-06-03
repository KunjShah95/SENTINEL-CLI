# Nightcode — Exhaustive Feature & Architecture Report

Source: `github.com/code-with-antonio/nightcode` (cloned for full inspection; 59 source files + 4 package.json + 1 schema + 1 config + 1 bin shim, plus root files).

This document enumerates every detail needed to reach feature parity. No behaviour is summarised away.

---

## 0. Repository Overview

| Field | Value |
|---|---|
| Name | `nightcode` (root) — product brand "NightCode" |
| Description | "A terminal-based AI coding agent. Plan, chat, and build inside your local project with a Bun-powered CLI, Hono API, Prisma ORM, Clerk auth, and AI SDK streaming." |
| Tutorial branches | `01-project-setup-component-architecture` through `11-the-end` (chapter table in README) |
| Workspace | Bun workspaces (`"workspaces": ["packages/*"]`) — no turborepo/lerna |
| Language | TypeScript strict mode |
| Runtime | Bun (>=1.x; uses `Bun.serve`, `Bun.spawn`, `Bun.Glob`, `crypto.subtle`) |
| License | Not declared in package.json |
| Stars/badges | "Terminal-based AI coding agent" — Bun, OpenTUI, React, Hono, Neon, Clerk, Polar, CodeRabbit, Sentry, Railway |

**Top-level files**
- `package.json` — root workspace manifest, only dep: `dotenv ^17.4.2`
- `tsconfig.base.json` — strict TS (see §A.1)
- `.env.example` — 16 env vars (see §A.7)
- `README.md` — tutorial branches, features list, setup walkthrough, project structure
- `bun.lock` (not yet read but present)

---

## A. Architecture

### A.1 Workspace Layout (Bun workspaces, no turborepo)

```
nightcode/
├── package.json                  # root (workspaces, dev scripts)
├── tsconfig.base.json            # shared TS config
├── .env.example                  # 16 env vars
├── README.md
└── packages/
    ├── cli/                      # @nightcode/cli — OpenTUI+React terminal client
    │   ├── package.json
    │   ├── bin/nightcode         # bun shim
    │   └── src/
    │       ├── index.tsx
    │       ├── theme.ts
    │       ├── components/
    │       │   ├── border.tsx
    │       │   ├── dialog-search-list.tsx
    │       │   ├── header.tsx
    │       │   ├── input-bar.tsx
    │       │   ├── session-shell.tsx
    │       │   ├── spinner.tsx
    │       │   ├── status-bar.tsx
    │       │   ├── command-menu/
    │       │   │   ├── index.tsx
    │       │   │   ├── commands.tsx
    │       │   │   ├── filter-commands.ts
    │       │   │   ├── types.ts
    │       │   │   └── use-command-menu.ts
    │       │   ├── dialogs/
    │       │   │   ├── index.tsx
    │       │   │   ├── agents-dialog.tsx
    │       │   │   ├── models-dialog.tsx
    │       │   │   ├── sessions-dialog.tsx
    │       │   │   └── theme-dialog.tsx
    │       │   └── messages/
    │       │       ├── index.tsx
    │       │       ├── bot-message.tsx
    │       │       ├── user-message.tsx
    │       │       └── error-message.tsx
    │       ├── hooks/
    │       │   └── use-chat.ts
    │       ├── layouts/
    │       │   ├── root-layout.tsx
    │       │   └── themed-root.tsx
    │       ├── lib/
    │       │   ├── api-client.ts
    │       │   ├── auth.ts
    │       │   ├── http-errors.ts
    │       │   ├── local-tools.ts
    │       │   ├── oauth.ts
    │       │   └── upgrade.ts
    │       ├── providers/
    │       │   ├── dialog/{index.tsx,types.ts}
    │       │   ├── keyboard-layer/index.tsx
    │       │   ├── prompt-config/index.tsx
    │       │   ├── theme/index.tsx
    │       │   └── toast/{index.tsx,types.ts}
    │       └── screens/
    │           ├── home.tsx
    │           ├── new-session.tsx
    │           └── session.tsx
    ├── server/                    # @nightcode/server — Hono API
    │   ├── package.json
    │   └── src/
    │       ├── index.ts
    │       ├── system-prompt.ts
    │       ├── lib/{auth,credits,models,polar}.ts
    │       ├── middleware/{require-auth,require-credits-balance}.ts
    │       └── routes/{auth,billing,chat,sessions}.ts
    ├── database/                  # @nightcode/database — Prisma
    │   ├── package.json
    │   ├── prisma/schema.prisma
    │   ├── prisma.config.ts
    │   └── src/{client,index}.ts  # generated/prisma/ re-exported
    └── shared/                    # @nightcode/shared — Zod schemas, tool contracts, model registry
        ├── package.json
        └── src/{index,models,schemas}.ts
```

### A.2 Root `package.json`

```json
{
  "name": "nightcode",
  "version": "1.0.0",
  "workspaces": ["packages/*"],
  "scripts": {
    "dev:cli": "bun run --watch packages/cli/src/index.tsx",
    "dev:server": "bun run --hot packages/server/src/index.ts",
    "build:cli": "bun run --filter @nightcode/cli build",
    "link:cli": "bun run build:cli && cd packages/cli && bun link"
  },
  "dependencies": { "dotenv": "^17.4.2" }
}
```

### A.3 `tsconfig.base.json`

`target: ESNext`, `module: Preserve`, `moduleResolution: bundler`, `allowImportingTsExtensions: true`, `verbatimModuleSyntax: true`, `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`, `skipLibCheck: true`, `noEmit: true`. Stricter flags explicitly off: `noUnusedLocals`, `noUnusedParameters`, `noPropertyAccessFromIndexSignature`.

### A.4 Package manifests

**`@nightcode/cli`** — `"module": "src/index.tsx"`, `"type": "module"`, `"bin": { "nightcode": "./bin/nightcode" }`. Deps: `@ai-sdk/react ^3.0.186`, `@opentui/core ^0.1.97`, `@opentui/react ^0.1.97`, `ai ^6.0.184`, `date-fns ^4.1.0`, `hono ^4.12.12`, `open ^11.0.0`, `opentui-spinner ^0.0.6`, `pretty-ms ^9.3.0`, `react ^19.2.4`, `react-router ^7.14.0`, `zod ^4.3.6`, `@nightcode/shared workspace:*`. DevDeps: `@nightcode/server workspace:*`, `@types/react ^19.2.14`, `@types/bun latest`. Build: `bun build src/index.tsx --outdir dist --target bun`.

**`@nightcode/server`** — `"type": "module"`, `exports: { ".": "./src/index.ts" }`. Deps: `@ai-sdk/anthropic ^3.0.68`, `@ai-sdk/openai ^3.0.52`, `@clerk/backend ^3.2.8`, `@hono/zod-validator ^0.7.6`, `@nightcode/database workspace:*`, `@nightcode/shared workspace:*`, `@polar-sh/sdk ^0.47.1`, `ai ^6.0.154`, `dotenv ^17.4.1`, `hono ^4.12.12`, `zod ^4.3.6`. Scripts: `dev: bun run --hot src/index.ts`, `build: bun build src/index.ts --outdir dist --target bun`, `postinstall: bun run --cwd ../database db:generate`.

**`@nightcode/database`** — `"type": "module"`, `exports: { ".": "./src/index.ts", "./client": "./src/client.ts" }`. Deps: `@prisma/adapter-pg ^7.7.0`, `@prisma/client ^7.7.0`, `dotenv ^17.4.1`. DevDeps: `prisma ^7.7.0`, `@types/node ^25.5.2`. Script: `db:generate: bunx prisma generate`.

**`@nightcode/shared`** — `"type": "module"`, `exports: { ".": "./src/index.ts" }`. Deps: `ai ^6.0.184`, `zod ^4.3.6`.

### A.5 Database schema (`prisma/schema.prisma`)

```prisma
generator client { provider = "prisma-client"; output = "../generated/prisma" }
datasource db { provider = "postgresql" }

model Session {
  id        String   @id @default(cuid())
  userId    String
  title     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  messages  Json     @default("[]")
  @@index([userId])
}
```

- No `User` table — users are external (Clerk `userId` only).
- No `Message` table — the entire chat log is a single JSON column.
- Connection string is **not** declared in `datasource db`; it is supplied via `prisma.config.ts` (see below) using `env("DATABASE_URL")`.

`prisma.config.ts`:
- Loads `../../.env` via `dotenv` from repo root.
- `defineConfig({ schema: "prisma/schema.prisma", migrations: { path: "prisma/migrations" }, datasource: { url: env("DATABASE_URL") } })`.

`src/client.ts`:
- Loads `../../../.env` (repo root) via dotenv.
- Throws if `DATABASE_URL` missing.
- `new PrismaPg({ connectionString: databaseUrl })`.
- `export const db = new PrismaClient({ adapter })`.

`src/index.ts` (database): `export * from "../generated/prisma/client.ts";` — re-exports the generated Prisma client.

### A.6 Server architecture (`packages/server/src/index.ts`)

- Hono app (no `Env` typing on root).
- `onError` global handler: if `HTTPException` → JSON `{ error: message }` with status; otherwise `console.error("Unhandled server error", error)` + `{ error: "Internal server error" }, 500`.
- Middleware mounts:
  - `app.use("/sessions/*", requireAuth)`
  - `app.use("/chat/*", requireAuth)`
  - `app.use("/billing/checkout", requireAuth)`
  - `app.use("/billing/portal", requireAuth)`
  - `/auth/callback` is **public**.
  - `/billing/success` is **public**.
- Routes: `.route("/auth", auth).route("/billing", billing).route("/sessions", sessions).route("/chat", chat)`.
- `export type AppType = typeof routes` — consumed by the CLI's hono client.
- Bun server default export: `{ port: 3000, fetch: app.fetch, idleTimeout: 255 }`. Comment: "idleTimeout must be high, otherwise LLM tool calls might not complete".

### A.7 `.env.example` (16 vars)

```
API_URL=http://localhost:3000
DATABASE_URL=

ANTHROPIC_API_KEY=
OPENAI_API_KEY=

CLERK_FRONTEND_API=
CLERK_OAUTH_CLIENT_SECRET=
CLERK_OAUTH_CLIENT_ID=
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
JWT_SECRET=jwt-secret

POLAR_ACCESS_TOKEN=
POLAR_PRODUCT_ID=
POLAR_SERVER=sandbox
POLAR_CREDITS_METER_ID=
```

- `CLERK_OAUTH_CLIENT_SECRET` is in `.env.example` only — not actually read by any TS file in the repo (Clerk `oauth/token` endpoint accepts the `code_verifier` without a secret in PKCE mode).
- `JWT_SECRET` is in `.env.example` only — not read anywhere in the source tree.
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` are read by the AI SDK provider packages (Anthropic/OpenAI SDKs auto-pick them up from env).

### A.8 `bin/nightcode` (CLI entry shim)

```ts
#!/usr/bin/env bun
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
await import("../src/index.tsx");
```

- Loads root `.env` quietly before importing the React entry.
- Executed by `bun link` so `nightcode` works as a global command.

### A.9 `src/index.tsx` (CLI entry)

- `createCliRenderer({ targetFps: 60, exitOnCtrlC: false })` from `@opentui/core`.
- `createMemoryRouter` from `react-router` with one parent layout route + 3 child routes:
  - `path: "/"` → `RootLayout` (layout) with `children: [
    - `index: true` → `Home`
    - `path: "sessions/new"` → `NewSession`
    - `path: "sessions/:id"` → `Session`
  ]`.
- `createRoot(renderer).render(<App />)`.
- `exitOnCtrlC: false` so the keyboard-layer provider can own ctrl+c handling.

### A.10 Provider tree (root-layout.tsx)

```
<ThemeProvider>
  <ToastProvider>
    <KeyboardLayerProvider>
      <DialogProvider>
        <PromptConfigProvider>
          <ThemedRoot>
            <Outlet />
          </ThemedRoot>
        </PromptConfigProvider>
      </DialogProvider>
    </KeyboardLayerProvider>
  </ToastProvider>
</ThemeProvider>
```

`ThemedRoot` renders `<box backgroundColor={colors.background} width="100%" height="100%" flexGrow={1}>{children}</box>`.

---

## B. Features (exhaustive)

### B.1 Terminal chat UI
- OpenTUI + React renderer, 60 FPS.
- Memory-router with three routes (Home, NewSession, Session).
- Mouse support throughout (mouse-move highlight, mouse-down to select on all dialog/menu rows).
- Provider-driven: theme, toast, keyboard-layer, dialog, prompt-config.
- Header (`Header.tsx`): centred `ascii-font` tiny render, "Night" in gray, "Code" in default color.

### B.2 PLAN vs BUILD modes
- Defined in `@nightcode/shared/schemas.ts` as `Mode = { BUILD: "BUILD", PLAN: "PLAN" } as const` + `modeSchema = z.enum([...])` + `type ModeType`.
- Stored in `PromptConfigContext` (no persistence — reverts to default on restart).
- Default mode: `Mode.BUILD`.
- Tab key in the input bar toggles mode (only when `isTopLayer("base")`).
- Visible in: `StatusBar`, `InputBar` border color (left border `┃` in primary color for BUILD, planMode color for PLAN), `BotMessage` footer badge, `UserMessage` border.
- PLAN mode hides `writeFile`, `editFile`, `bash`:
  - `getToolContracts(mode)` returns `readOnlyToolContracts` for PLAN, `buildToolContracts` for BUILD.
  - Client-side guard in `executeLocalTool`: `if (mode === Mode.PLAN && !["readFile", "listDirectory", "glob", "grep"].includes(toolName)) throw`.
- System prompt differs (§B.3).
- Available modes dialog (`/agents`) lets user pick Build or Plan.

### B.3 System prompt (`system-prompt.ts`)
- Builder returns three sections joined with `\n`:
  1. Header (always): "You are an expert software engineer working as a coding assistant inside a terminal application. The application has two modes the user can switch between: **PLAN** — Read-only analysis and planning. No file modifications. **BUILD** — Full implementation with read and write tools."
  2. Mode description (PLAN or BUILD).
  3. Tool usage (different list per mode).
- **PLAN** tools: `readFile`, `listDirectory`, `glob`, `grep`. Rules: be decisive, never re-read files, batch tool calls.
- **BUILD** tools: `readFile`, `writeFile`, `editFile`, `listDirectory`, `glob`, `grep`, `bash`. Same 3 rules plus "Use editFile for small changes to existing files. Only use writeFile when creating new files or rewriting most of a file."

### B.4 AI model registry (`@nightcode/shared/models.ts`)

| Model | Provider | Input $/M | Output $/M | Thinking |
|---|---|---:|---:|---|
| `claude-sonnet-4-6` | anthropic | 3 | 15 | yes (10k budget) |
| `claude-haiku-4-5` | anthropic | 1 | 5 | no |
| `claude-opus-4-6` (DEFAULT) | anthropic | 5 | 25 | yes (10k budget) |
| `gpt-5.4` | openai | 2.5 | 15 | yes (`reasoningSummary: detailed`) |
| `gpt-5.4-mini` | openai | 0.75 | 4.5 | no |
| `gpt-5.4-nano` | openai | 0.2 | 1.25 | no |

- `SUPPORTED_CHAT_MODELS` is `as const satisfies readonly SupportedChatModelDefinition[]`.
- `SupportedProvider = "anthropic" | "openai"` (Google provider type alias exists in `lib/models.ts` but no models).
- `findSupportedChatModel(modelId)` linear lookup.
- `DEFAULT_CHAT_MODEL_ID = "claude-opus-4-6"`.
- `SupportedChatModel = (typeof SUPPORTED_CHAT_MODELS)[number]`, `SupportedChatModelId = SupportedChatModel["id"]`.

### B.5 Tool contracts (`@nightcode/shared/schemas.ts`)

**`toolInputSchemas`** (zod):
- `readFile: { path: string }` ("Relative path to the file to read")
- `listDirectory: { path?: string = "." }` ("Relative directory path to list")
- `glob: { pattern: string, path?: string = "." }` ("Glob pattern", "Directory to search from")
- `grep: { pattern: string, path?: string = ".", include?: string }` ("Regex pattern", "Directory to search from", "Optional glob for files to include")
- `writeFile: { path: string, content: string }` ("Relative path to write", "File contents")
- `editFile: { path: string, oldString: string, newString: string }` ("Relative path to edit", "Exact text to replace; must be unique", "Replacement text")
- `bash: { command: string, description?: string, timeout?: number }` ("Shell command", "Short description", "Timeout in ms")

**`readOnlyToolContracts`** (AI SDK `tool()`):
- `readFile` — "Read a file from the current project directory."
- `listDirectory` — "List entries in a directory under the current project directory."
- `glob` — "Find files matching a glob pattern under the current project directory."
- `grep` — "Search file contents with a regular expression under the current project directory."

**`buildToolContracts`** = readOnly + :
- `writeFile` — "Create or overwrite a file under the current project directory."
- `editFile` — "Replace exact text in a file under the current project directory."
- `bash` — "Run a shell command in the current project directory."

`getToolContracts(mode)` returns the right set. `ToolContracts = typeof buildToolContracts`.

### B.6 Client-side tool execution (`lib/local-tools.ts`)

All tools run **client-side** in the CLI process. Server never executes them — it only streams the model's tool calls; the client receives them via `onToolCall` and runs the implementations.

- Guard: PLAN mode rejects `writeFile`/`editFile`/`bash`.
- `resolveInsideCwd(path)`: `resolve(cwd, path)`, then ensures `relative(cwd, resolved)` does not start with `..` and is not absolute. Throws "Path is outside the project directory" otherwise.
- `truncate(value, limit)`: appends `\n... (truncated, N total chars)` if value exceeds `limit`.

**`readFile`** — `fs/promises.readFile(resolved, "utf-8")`. If `content.length > MAX_FILE_SIZE (10_000)` returns `{ content: content.slice(0, 10_000), truncated: true, totalLength: content.length }`. Else `{ content }`.

**`listDirectory`** — `readdir(resolved)` (no `withFileTypes`), then `stat` each entry. Skips entries starting with `.` and `node_modules`. Returns `{ name, type: "file" | "directory" }` array. Sorts: directories first, then alphabetical. Output: `{ path: relative(cwd, resolved) || ".", entries: results }`.

**`glob`** — `new Bun.Glob(pattern).scan({ cwd: resolved, dot: false, onlyFiles: true })`. Skips matches containing `node_modules`. Caps at `MAX_RESULTS (200)` and sets `truncated: true`. Sorts returned paths. Output: `{ files, ...(truncated ? { truncated: true } : {}) }`.

**`grep`** — Shells out to `grep -rn --color=never --exclude-dir=node_modules --exclude-dir=.git -E [--include=GLOB] PATTERN RESOLVED`. Exit codes: 0 (matches) and 1 (no matches) are normal; anything else throws `grep failed: <stderr>`. Parses each output line via regex `^(.+?):(\d+):(.*)$` into `{ file, line, content }`. Caps at `MAX_MATCHES (50)` and sets `truncated: true, totalMatches: lines.length`. Output: `{ matches, ...(truncated ? { truncated: true, totalMatches } : {}) }`. Returns `{ matches: [], message: "No matches found" }` if stdout empty.

**`writeFile`** — `mkdir(dirname(resolved), { recursive: true })`, then `writeFile(resolved, content, "utf-8")`. Output: `{ success: true, path: relative(cwd, resolved), bytesWritten: Buffer.byteLength(content, "utf-8") }`.

**`editFile`** — Reads file; `content.split(oldString).length - 1` for occurrences. Throws "oldString not found in file" if 0; "oldString is ambiguous; found N matches" if >1. Writes `content.replace(oldString, newString)`. Output: `{ success: true, path: relative(cwd, resolved) }`.

**`bash`** — `Bun.spawn(["bash", "-c", command], { cwd: resolveInsideCwd(".").resolved, stdout: "pipe", stderr: "pipe", env: { ...process.env, TERM: "dumb" } })`. Kills process on `timeout` (default `DEFAULT_TIMEOUT (30_000)`). Reads both streams as text. Output: `{ stdout: truncate(stdout, MAX_OUTPUT (20_000)), stderr: truncate(stderr, MAX_OUTPUT), exitCode }`.

`MAX_FILE_SIZE = 10_000`, `MAX_RESULTS = 200`, `MAX_MATCHES = 50`, `MAX_OUTPUT = 20_000`, `DEFAULT_TIMEOUT = 30_000`.

### B.7 Chat hook (`hooks/use-chat.ts`)

- Wraps `useChat` from `@ai-sdk/react`.
- `DefaultChatTransport` configured with:
  - `api: apiClient.chat.$url().toString()` (honor `appType`-typed client).
  - `headers()`: returns `Authorization: Bearer <token>` from `getAuth()`, or empty Headers.
  - `prepareSendMessagesRequest({ messages })`:
    - Takes `last` message; if role is `assistant` and previous is `user`, sends `[previous, last]`, else `[last]`.
    - Finds the most recent message that has both `mode` and `model` metadata (i.e. any prior turn).
    - Body: `{ id: sessionId, messages: requestMessages, mode: message.metadata?.mode ?? metadata?.mode, model: message.metadata?.model ?? metadata?.model }`.
- `useAiChat` options:
  - `id: sessionId` (so AI SDK can resume per-session state).
  - `messages: initialMessages` (seeded from server's session JSON).
  - `onToolCall({ toolCall })`: reads mode from `chat.messages.at(-1)?.metadata?.mode ?? "BUILD"`, calls `executeLocalTool(toolCall.toolName, toolCall.input, mode)`, then `chat.addToolOutput({ tool, toolCallId, output })` on success or `{ state: "output-error", errorText }` on failure.
  - `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` — re-send after all tool outputs in.
- Returned helpers:
  - `messages: chat.messages`
  - `status: chat.status`
  - `error: chat.error`
  - `submit({ userText, mode, model })` → `chat.sendMessage({ text: userText, metadata: { mode, model } })`
  - `abort: chat.stop`, `interrupt: chat.stop` (aliased)

`ChatMessageMetadata = { mode?, model?, durationMs?, usage? }`. `Message = UIMessage<ChatMessageMetadata, never, ChatTools>` where `ChatTools = { [K in keyof InferUITools<ToolContracts>]: { input: InferUITools<ToolContracts>[K]["input"]; output: unknown } }`.

### B.8 Server chat route (`routes/chat.ts`)

- `POST /` — middleware order: `requireCreditsBalance`, `submitValidator`, then handler.
- `submitSchema`: `{ id: string, messages: NightcodeUIMessage[] (min 1), mode: modeSchema, model: z.string().refine(isSupportedChatModel, "Unsupported model") }`.
- `NightcodeUIMessage = UIMessage<ChatMessageMetadata, never, InferUITools<ToolContracts>>`; `ChatMessageMetadata = { mode?, model?, durationMs?, usage? }`.
- Handler:
  1. `userId = c.get("userId")`.
  2. Load session by `{ id, userId }` → 404 if missing.
  3. `startTime = Date.now()`.
  4. `tools = getToolContracts(mode)`.
  5. `resolvedModel = resolveChatModel(model)`.
  6. Merge incoming messages with previous session messages by `id` (replace existing, append new), stamping metadata `{ mode, model }` on each.
  7. `validateUIMessages<NightcodeUIMessage>({ messages: merged, tools })`.
  8. `convertToModelMessages(nextMessages, { tools })`.
  9. `streamText({ model: resolvedModel.model, system: buildSystemPrompt({ mode }), messages: modelMessages, tools, providerOptions: resolvedModel.providerOptions, onFinish: (e) => completedUsage = e.totalUsage })`.
  10. `result.toUIMessageStreamResponse<NightcodeUIMessage>(...)` with:
      - `messageMetadata({ part })`: returns `{ mode, model }` on `start`; returns `{ mode, model, durationMs: Date.now() - startTime, ...(completedUsage ? { usage: completedUsage } : {}) }` on `finish`; otherwise `undefined`.
      - `onFinish(event)`:
        - If `event.isAborted` → return.
        - If `hasPendingToolCalls(event.responseMessage)` → return (don't persist mid-tool-call state).
        - Persist `event.messages` to `db.session.update({ where: { id, userId }, data: { messages: event.messages } })`.
        - If `completedUsage` is set: `calculateCreditsForUsage({ provider, model, usage })` → `ingestAiUsage({ externalCustomerId: userId, eventId: "chat-message:" + event.responseMessage.id, credits })`. Errors are logged, not thrown.
      - `onError(error)`: returns `error.message ?? String(error)` for the SSE error frame.

`hasPendingToolCalls(message)`: returns true if any part is `dynamic-tool` or starts with `tool-` AND state is not `output-available` and not `output-error`.

### B.9 Model resolution (`server/src/lib/models.ts`)

`ResolvedModel = { model: LanguageModel, provider: SupportedProvider, modelId: SupportedChatModelId, providerOptions?: ProviderOptions }`.

- `ANTHROPIC_PROVIDER_OPTIONS`:
  - `claude-opus-4-6`: `anthropic: { thinking: { type: "enabled", budgetTokens: 10000 } }`
  - `claude-sonnet-4-6`: same
  - `claude-haiku-4-5`: none
- `OPENAI_PROVIDER_OPTIONS`:
  - `gpt-5.4`: `openai: { thinking: { reasoningSummary: "detailed" } }`
  - `gpt-5.4-mini` / `gpt-5.4-nano`: none
- `resolveAnthropicModel` returns `anthropic(modelId)` + provider options.
- `resolveOpenAIModel` returns `openai(modelId)` + provider options.
- `assertUnsupportedProvider(provider: never)` throws "Unsupported provider: ..." (catches Google types defensively, though no google models).
- `isSupportedChatModel(modelId)` type guard.
- `resolveChatModel(modelId)` throws "Unsupported model: ..." on miss.

### B.10 Credits math (`server/src/lib/credits.ts`)

Constants: `TOKENS_PER_MILLION = 1_000_000`, `USD_PER_CREDIT = 0.01` (1 credit = $0.01). Comment: "Nightcode charges in internal credits instead of exposing provider pricing."

`getTokenCounts(usage)`: validates `inputTokens` and `outputTokens` are non-null, finite, integer, non-negative. Throws "Credit conversion requires input and output token counts" otherwise.

`getModelPricing(provider, model)`: looks up model in shared registry. Validates the model exists AND its `provider` matches. Throws "Unsupported billing provider: X" if provider unknown, "Unsupported billing model: X" if model wrong.

`estimateCostUsd({ inputTokens, outputTokens }, pricing) = (input * pricing.inputUsdPerMillionTokens + output * pricing.outputUsdPerMillionTokens) / TOKENS_PER_MILLION`.

`convertUsdToCredits(estimatedCostUsd)`: returns 0 if cost ≤ 0; else `Math.max(1, Math.ceil(estimatedCostUsd / USD_PER_CREDIT))`. Comment: "If a request costs any non-zero amount, charge at least 1 credit, then round up so partial credits always become a whole credit."

`calculateCreditsForUsage({ provider, model, usage })` returns `{ credits: number }`.

### B.11 Polar billing (`server/src/lib/polar.ts`)

- `getRequiredEnv(name)`: throws `${name} environment variable is required` if missing.
- `getPolarAccessToken`, `getPolarProductId`, `getPolarCreditsMeterId`: wrappers.
- `getPolarServer()`: defaults to `"sandbox"`; throws if not "sandbox" or "production".
- Singleton `Polar({ accessToken, server })` client.
- `createCheckoutUrl({ customerExternalId, requestUrl })` → `polar.checkouts.create({ products: [POLAR_PRODUCT_ID], successUrl: new URL("/billing/success", requestUrl).toString(), externalCustomerId: customerExternalId, metadata: { source: "nightcode-cli" } })` → returns `result.url`.
- `createCustomerPortalUrl({ customerExternalId, requestUrl })` → `polar.customerSessions.create({ externalCustomerId, returnUrl: new URL("/billing/success", requestUrl).toString() })` → returns `result.customerPortalUrl`.
- `getAvailableCreditsBalance(customerExternalId)`:
  - `polar.customers.getStateExternal({ externalId })` → `customerState.activeMeters`.
  - Filters to meter with id matching `POLAR_CREDITS_METER_ID`. Throws "Expected exactly one matching Polar credits meter" if more than one.
  - Returns `creditsMeter?.balance ?? 0`.
  - On error with `statusCode === 404`, returns 0; otherwise rethrows.
- `ingestAiUsage({ externalCustomerId, eventId, credits })`:
  - Returns early if `credits <= 0`.
  - `polar.events.ingest({ events: [{ name: "nightcode_usage", externalId: eventId, externalCustomerId, metadata: { credits } }] })`.

### B.12 Server auth (`lib/auth.ts` + `middleware/require-auth.ts`)

- `lib/auth.ts`:
  - Throws if `CLERK_SECRET_KEY` or `CLERK_PUBLISHABLE_KEY` missing.
  - `createClerkClient({ secretKey, publishableKey })`.
  - `authenticateOAuthRequest(request)`: calls `clerkClient.authenticateRequest(request, { acceptsToken: "oauth_token" })`. Returns `null` if `!isAuthenticated`. Returns `null` if `tokenType !== "oauth_token" || !userId`. Else returns `{ userId }`.
- `middleware/require-auth.ts`:
  - `AuthenticatedEnv = { Variables: { userId: string } }`.
  - `requireAuth` middleware: on success, `c.set("userId", auth.userId)` then `next()`. On any error, returns `c.json({ error: "Unauthorized. Run /login to continue." }, 401)`.

### B.13 Credit-balance middleware (`middleware/require-credits-balance.ts`)

- Reads `userId` from context.
- `creditsBalance = await getAvailableCreditsBalance(userId)`.
- If `<= 0`: returns `c.json({ error: "No credits remaining. Run /upgrade to buy more credits." }, 402)`.
- On any error: returns `c.json({ error: "Unable to verify credits balance right now." }, 503)`.
- Comment: "This is a simple launch-time gate: only start new work when the customer still has credits left. It does not reserve the full eventual cost of the request, so low-volume apps may tolerate small overspend on edge cases."

### B.14 Server routes

**`routes/auth.ts`** — single endpoint:
- `GET /auth/callback`:
  - Reads `code`, `state`, `error`, `error_description`.
  - If `error`: returns `c.text(errorDescription ?? error, 400)`.
  - If no `code` or `state`: returns `c.text("Missing authorization code or state", 400)`.
  - Decodes `state` as `<base64url-encoded-JSON>.<rest>`. Parses JSON, reads `payload.port`. Throws if `!port || typeof port !== "number"`.
  - Redirects to `http://localhost:${port}/callback?code=${encoded}&state=${encoded}`.
  - On any error: `c.text("Invalid authentication state", 400)`.

**`routes/billing.ts`**:
- `POST /billing/checkout` (auth) → `{ url: await createCheckoutUrl({ customerExternalId: userId, requestUrl: c.req.url }) }`.
- `POST /billing/portal` (auth) → `{ url: await createCustomerPortalUrl({ customerExternalId: userId, requestUrl: c.req.url }) }`.
- `GET /billing/success` (public) → `c.text("Done. You can close this tab and return to Nightcode.")`.

**`routes/sessions.ts`**:
- `GET /` (auth) → `db.session.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id, title, createdAt } })`.
- `GET /:id` (auth) → `db.session.findUnique({ where: { id, userId } })`. 404 if missing.
- `POST /` (auth + `requireCreditsBalance`) → `db.session.create({ data: { ...data, userId } })`, 201.
- `createSessionSchema = z.object({ title: z.string() })`.
- Two commented-out MOCK blocks in `GET /:id` and `POST /` for simulating slow / failed session loading (intentionally left in for tutorial).

**`routes/chat.ts`** — see §B.8.

### B.15 CLI auth (PKCE OAuth, `lib/oauth.ts`)

`performLogin()` flow:
1. Reads `CLERK_FRONTEND_API`, `CLERK_OAUTH_CLIENT_ID`; `apiUrl = process.env.API_URL ?? "http://localhost:3000"`.
2. Throws if first two missing.
3. `nonce = crypto.randomUUID()`.
4. `codeVerifier = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))`.
5. `codeChallenge = base64url(SHA-256(verifier))` via `crypto.subtle.digest`.
6. `state = base64url(JSON.stringify({ port, nonce }))`.
7. Spins up `Bun.serve({ port: 0, fetch })` to receive the redirect:
   - Only accepts `GET /callback`.
   - On `error` param: `reject(new Error(description))`, returns 400.
   - Validates `code` and `state` are present.
   - Decodes state, verifies `payload.nonce === nonce` (else reject).
   - POSTs to `${clerkFrontendApi}/oauth/token` with `application/x-www-form-urlencoded` body: `grant_type=authorization_code`, `code`, `redirect_uri=${apiUrl}/auth/callback`, `client_id`, `code_verifier`. (Note: this is the server's `/auth/callback` URL, **not** the CLI's localhost port — Clerk hits the server, which then redirects to the CLI.)
   - On success: `saveAuth({ token: access_token })`, resolves with token, returns "Authenticated! You can close this tab." 200.
   - On failure: rejects with the error message, returns 400.
8. Reads `server.port` (rejects "Failed to start callback server" if not a number).
9. Opens browser via `open(authorizeUrl.toString())` to `${clerkFrontendApi}/oauth/authorize?...` with: `response_type=code`, `client_id`, `redirect_uri=${apiUrl}/auth/callback`, `scope="openid email profile"`, `state`, `prompt=login`, `code_challenge`, `code_challenge_method=S256`.
10. 5-minute timeout: `setTimeout(() => { if (!settled) reject(new Error("Login timed out")) }, 5*60*1000)`.
11. Server is stopped 500ms after settling via `setTimeout(() => server.stop(), 500)`.

Login timing & commands: `/login` command shows "Opening browser to sign in..." toast → awaits `performLogin` → on success shows "Signed in" success toast; on error shows error message in error toast (or "Sign in failed or timed out"). `/logout` calls `clearAuth()` and shows "Signed out" success toast.

### B.16 CLI auth storage (`lib/auth.ts`)

- `AUTH_DIR = ~/.nightcode`, `AUTH_FILE = ~/.nightcode/auth.json`.
- `getAuth()`: returns `null` on read/parse failure; otherwise `{ token }` if `parsed.token` is a string.
- `saveAuth(data)`: `mkdirSync(AUTH_DIR, { mode: 0o700 })` if missing, then `writeFileSync(AUTH_FILE, JSON.stringify(data), { mode: 0o600 })`.
- `clearAuth()`: `unlinkSync(AUTH_FILE)`, swallowed if missing.

### B.17 API client (`lib/api-client.ts`)

- `apiClient = hc<AppType>(process.env.API_URL ?? "http://localhost:3000", { fetch })`.
- Custom `fetch` wrapper:
  - Adds `Authorization: Bearer <token>` from `getAuth()` if present.
  - On 401 response, calls `clearAuth()`.
  - Returns the response unchanged.

### B.18 Polar upgrade flow (`lib/upgrade.ts`)

- `openUpgradeCheckout()`: `apiClient.billing.checkout.$post()`; if `ok`, `open(data.url)`. Throws `getErrorMessage(response)` on failure.
- `openBillingPortal()`: `apiClient.billing.portal.$post()`; if `ok`, `open(data.url)`. Throws on failure.

`/upgrade` command shows "Opening credits checkout..." then success/error toast. `/usage` shows "Opening billing portal..." then success/error toast.

### B.19 HTTP error extraction (`lib/http-errors.ts`)

`getErrorMessage(response)`: tries `response.json()` for `{ error?: string }`; falls back to `response.statusText || "Request failed with status ${response.status}"`.

### B.20 Themes (`theme.ts`)

36 themes defined as `Theme = { name: string, colors: ThemeColors }`. `ThemeColors` keys: `primary, planMode, selection, thinking, success, error, info, background, surface, dialogSurface, thinkingBorder, dimSeparator`.

Themes: Nightfox (default), Catppuccin Mocha, Dracula, Monokai Pro, Tokyo Night, Nord, Synthwave, Midnight Sky, Neon Nights, Hacker Terminal, One Dark, Xcode Midnight, Catppuccin Frappe, Vercel Dark, Material Ocean, Dusk, Ocean, Soft Midnight, Minimal Dark, Solarized Dark, Gruvbox Dark, Rosé Pine, Rosé Pine Moon, Kanagawa, Everforest Dark, Ayu Dark, GitHub Dark, Palenight, Vesper, Poimandres, Moonlight, Vitesse Dark.

### B.21 Theme provider (`providers/theme/index.tsx`)

- `getInitialTheme()`: reads `~/.nightcode/preferences.json`, parses `{ themeName }`, finds matching theme, falls back to `DEFAULT_THEME` (Nightfox).
- `persistTheme(theme)`: `mkdirSync(CONFIG_DIR, { recursive: true })`, `writeFileSync(THEME_PREFERENCES_PATH, JSON.stringify({ themeName }))`. Silently ignores write failures.
- `useTheme()` returns `{ colors, currentTheme, setTheme }`.

### B.22 Theme dialog

- `/theme` command opens `ThemeDialogContent`.
- `DialogSearchList` over `THEMES` with `filterFn = t.name.toLowerCase().includes(query)`.
- `onHighlight(theme)`: previews the theme live by calling `setTheme(theme)`.
- `onSelect(theme)`: sets `confirmedRef = true` + `setTheme(theme)` + `dialog.close()`.
- `useEffect` cleanup: if `!confirmedRef.current` on unmount, `setTheme(originalThemeRef.current)` — reverts preview if user dismisses without selecting.
- Render: text `•  <name>` (with `•` only on the original theme), padded to keep alignment.

### B.23 Toast provider (`providers/toast/index.tsx`)

- `useToast().show({ message, variant, duration? })`.
- `ToastVariant = "success" | "error" | "info"`. `DEFAULT_DURATION = 3000`.
- Single-toast model: `setCurrentToast(options)` cancels any previous timer (`clearTimeout`), schedules new with `setTimeout(...).unref()` so it doesn't block process exit.
- Render: absolute-positioned box at `top={2}, right={2}`, width clamped to `[1, min(60, terminal.width - 6)]`, padding 1–2, `colors.surface` background, side borders (`left` + `right`) with `SplitBorderChars` (vertical `┃`), border color = variant color.

### B.24 Dialog provider (`providers/dialog/index.tsx`)

- `useDialog().open(DialogConfig) | close()`.
- `DialogConfig = { title: string, children: ReactNode }`.
- `open` pushes `"dialog"` layer with a responder that calls `close` and returns `true` (absorbs ctrl+c).
- Render: absolute-positioned full-screen overlay with semi-transparent black (`RGBA.fromInts(0,0,0,150)`) at `zIndex={100}`; inner box at `Math.min(60, dimensions.width - 4)` wide, `colors.dialogSurface` background, padding 4×1, title row with `text attributes={TextAttributes.BOLD}` and a small `[esc]` close hint. Click on overlay calls `close`; click on inner box stops propagation.
- Escape key closes the dialog (only when `isTopLayer("dialog")`).

### B.25 Keyboard layer provider (`providers/keyboard-layer/index.tsx`)

- Stack of layer ids initialized to `["base"]`.
- API: `push(id, responder?)`, `pop(id)`, `isTopLayer(id)`, `setResponder(id, responder | null)`.
- `Responder = () => boolean` — return `true` to absorb the key.
- Single `useKeyboard` listener for `ctrl+c`:
  - Walks the stack top-down; first responder returning `true` wins.
  - If no responder handles it: `renderer.destroy()` (process exit).
- `setResponder` is used by `InputBar` to register a "base" responder that clears the textarea on `ctrl+c`.

### B.26 Prompt-config provider (`providers/prompt-config/index.tsx`)

- `usePromptConfig()` returns `{ mode, toggleMode, setMode, model, setModel }`.
- Defaults: `mode = Mode.BUILD`, `model = DEFAULT_CHAT_MODEL_ID = "claude-opus-4-6"`.
- `toggleMode()` flips BUILD ↔ PLAN.
- No persistence (in-memory only).

### B.27 Agents dialog (`components/dialogs/agents-dialog.tsx`)

- `AVAILABLE_MODES = [Mode.BUILD, Mode.PLAN]`.
- `DialogSearchList` filtering on `getModeLabel(item).toLowerCase().includes(query)`.
- Renders `• <label>` for the current mode (3-char padding for alignment).
- Selecting calls `onSelectMode(mode)` then `dialog.close()`.

### B.28 Models dialog (`components/dialogs/models-dialog.tsx`)

- Receives `models: SupportedChatModelId[]` and `onSelectModel`.
- `DialogSearchList` filtering on `modelId.toLowerCase().includes(query)`.
- ⚠️ Bug: imports `Mode` from `@nightcode/database/enums` — that path is not exported by `@nightcode/database`. `Mode` is unused in this file (only `ModelsDialogContent` is used), so the import is a dead-code error in strict mode.

### B.29 Sessions dialog (`components/dialogs/sessions-dialog.tsx`)

- On mount: `apiClient.sessions.$get()` (which routes to `GET /sessions`).
- Shows "Loading sessions..." while pending; shows error toast and closes on error.
- `DialogSearchList` filtering on `s.title.toLowerCase().includes(query)`.
- Render: title text + spacer + right-aligned formatted `hh:mm a` from `createdAt` (date-fns `format`).
- Selecting calls `dialog.close()` then `navigate("/sessions/" + session.id)`.
- Type inferred via `InferResponseType<(typeof apiClient.sessions)["$get"], 200>[number]`.

### B.30 Dialog search list (`components/dialog-search-list.tsx`)

- Generic `DialogSearchList<T>`:
  - Props: `items: T[]`, `onSelect(item)`, `onHighlight?(item)`, `filterFn(item, query)`, `renderItem(item, isSelected): ReactNode`, `getKey(item): string`, `placeholder = "Search"`, `emptyText = "No results"`.
  - Internal: `selectedIndex` (0), `searchValue` (""), `InputRenderable` ref, `ScrollBoxRenderable` ref.
  - `useKeyboard` only when `isTopLayer("dialog")`:
    - `return` / `enter`: calls `onSelect(filtered[selectedIndex])`.
    - `up`: `setSelectedIndex(max(0, i-1))`, scrolls scrollbox to keep highlight visible, fires `onHighlight`.
    - `down`: `setSelectedIndex(min(filtered.length-1, i+1))`, auto-scrolls viewport edge, fires `onHighlight`.
  - Input: `<input ref focused onContentChange>` resets `selectedIndex` to 0 and `scrollTo(0)`.
  - List: `<scrollbox height={Math.min(filtered.length, MAX_VISIBLE_ITEMS=6)}>` of `<box height=1 backgroundColor={isSelected ? colors.selection : undefined} onMouseMove onMouseDown>` rows. Mouse-move sets selection, mouse-down selects.
  - Empty state: dimmed `<text>{emptyText}</text>`.

### B.31 Command menu (slash commands)

`commands.tsx` exports `COMMANDS: Command[]`:

| Name | Description | Value | Action |
|---|---|---|---|
| `new` | Start a new conversation | `/new` | `ctx.navigate("/")` |
| `agents` | Switch agents | `/agents` | Opens Agents dialog |
| `models` | Select AI model | `/models` | Opens Models dialog (items = all supported model ids) |
| `sessions` | Browse past sessions | `/sessions` | Opens Sessions dialog |
| `theme` | Change color theme | `/theme` | Opens Theme dialog |
| `login` | Sign in with browser | `/login` | `performLogin()` + toasts |
| `logout` | Sign out | `/logout` | `clearAuth()` + success toast |
| `upgrade` | Buy more credits | `/upgrade` | `openUpgradeCheckout()` + toasts |
| `usage` | Open billing portal | `/usage` | `openBillingPortal()` + toasts |
| `exit` | Quit the application | `/exit` | `ctx.exit()` (renderer.destroy) |

`Command = { name, description, value, action?(ctx: CommandContext): void | Promise<void> }`.
`CommandContext = { exit: () => void, toast: ToastContextValue, dialog: DialogContextValue, navigate: (path) => void, mode: ModeType, setMode: (m) => void, setModel: (m) => void }`.

`filter-commands.ts` — `getFilteredCommands(query)`: empty query returns all; otherwise filters by `cmd.name.toLowerCase().startsWith(query.toLowerCase())`.

`use-command-menu.ts` — `useCommandMenu()`:
- `textValue` (textarea content), `selectedIndex`, `showCommandMenu`, `scrollRef`.
- `commandQuery` = text after the leading `/` if `textValue.startsWith("/")` AND no space in `textValue` (slash arg must be a single token).
- `handleContentChange(text)`:
  - Sets `textValue`, resets `selectedIndex`, `scrollbox.scrollTo(0)`.
  - If `text.startsWith("/")` and the slice after `/` has no space, `setShowCommandMenu(true)` and `push("command", () => { close(); return true })`.
  - Else `close()` (which pops the "command" layer).
- `resolveCommand(index)`: returns the command at index in `filteredCommands`; if found, `close()`.
- `useKeyboard` (only when `isTopLayer("command")`):
  - `escape`: `close()`.
  - `up`/`down`: arrow-key nav with auto-scroll.
- Return: `{ showCommandMenu, commandQuery, selectedIndex, scrollRef, handleContentChange, resolveCommand, setSelectedIndex }`.

`command-menu/index.tsx`:
- `MAX_VISIBLE_ITEMS = 8`.
- `COMMAND_COL_WIDTH = max(name.length) + 4` (computed once from all commands).
- Renders a `<scrollbox>` of rows: `/name` (in a fixed-width column) + description. Mouse-move sets selection, mouse-down executes.
- Empty state: dimmed "No matching commands".

`InputBar`:
- Renders the command menu above the textarea (`position="absolute" bottom="100%" zIndex={10}`).
- On submit: if `showCommandMenu`, calls `handleCommand(resolveCommand(selectedIndex))`. `handleCommand(command)`: clears textarea; if `command.action`, calls it with `CommandContext`; else `textarea.insertText(command.value + " ")`.

### B.32 Input bar (`components/input-bar.tsx`)

- Multi-line `<textarea>` with `keyBindings`:
  - `return`/`enter` → `submit`
  - `shift+return` / `shift+enter` → `newline`
- Border: left-only with custom `vertical: "┃", bottomLeft: "╹"` from `EmptyBorder`; border color = `primary` for BUILD, `planMode` for PLAN.
- Background: `colors.surface`, paddingX=2, paddingY=1, gap=1.
- Placeholder: `Ask anything... "Fix a bug in the database"`.
- Below textarea: `<StatusBar />` (mode › model).
- Uses `useCommandMenu` for slash-commands and a parallel `findActiveMention` flow for `@file` mentions.
- `findActiveMention(text, cursorOffset)`:
  - Walks the current whitespace-delimited token (scan back/forward for `\s`).
  - Finds the last `@` at or before the cursor.
  - Returns `null` if the char before `@` is a `mention-query` char (`[A-Za-z0-9._/-]`), or if the cursor is outside the mention span.
  - Else returns `{ start, end, query }`.
- `getMentionCandidates(query)`:
  - Normalizes `./` prefix; rejects queries starting with `/` (absolute paths).
  - Splits into `directoryPart` and `namePrefix` (handling trailing slash).
  - `absoluteDirectory = resolve(CURRENT_DIRECTORY, directoryPart || ".")`; rejects if outside cwd.
  - Direct matches: `readdir(absoluteDirectory, { withFileTypes: true })`, filter out hidden (unless query starts with `.`), filter by `lowercasePrefix` prefix, sort dirs-first then alphabetical. Map entries to `{ path: directoryPart ? dir/entry : entry, kind }`; directories get a trailing `/`.
  - If direct matches exist, or `directoryPart !== ""` (i.e. user typed a slash), or `namePrefix === ""` (empty query): return direct matches.
  - Else: recursive walk of cwd (skipping `node_modules` and hidden), prefix-matching up to `MAX_FALLBACK_MENTION_CANDIDATES (32)` entries, sort alphabetically.
- `FileMentionMenu`:
  - Renders `<scrollbox height={Math.min(candidates.length, MAX_VISIBLE_MENTIONS=8)}>` of rows `{ path | spacer | kind label (Folder/File) }`.
  - On click: `onSelect(index)`; on mouse-down: `onExecute(index)`.
  - Selection via mouse-move or arrow keys (when `isTopLayer("mention")`).
  - Empty state: dimmed "No matching files or folders".
- Mention lifecycle:
  - `syncMentionMenu(text, cursorOffset)`: re-evaluates mention; pushes/pops `"mention"` layer (responder closes menu). On mention change, resets `mentionSelectedIndex` to 0 and `scrollTo(0)`.
  - `useEffect` on `activeMention`: async-loads candidates, sets `mentionCandidates`, clamps `mentionSelectedIndex`.
- `handleMentionExecute(index)`: inserts `@<insertion> ` (or `@<dir>/` for directories) at the mention span; sets cursor to just after the insertion; re-syncs the menu (so mentioning from inside a directory continues the search).
- Ctrl+C responder registered for `"base"` layer: if `textarea.plainText.length > 0`, clears textarea and returns `true`; else returns `false` (lets it fall through).
- Tab key (in `useKeyboard` while `isTopLayer("base")`): `key.preventDefault(); toggleMode()`.
- `useKeyboard` for mention menu (only when `isTopLayer("mention")`): escape closes; up/down move selection with auto-scroll.
- Submit wiring: `onSubmitRef.current` (mutable ref) is set on every render so the textarea's `onSubmit` always reads fresh state:
  - If `showCommandMenu`: handle command.
  - Else if `showMentionMenu`: `handleMentionExecute(mentionSelectedIndex)`.
  - Else: `handleSubmit()`.
- `handleSubmit()`: if `disabled`, noop; trims text; if empty, noop; calls `onSubmit(text)`, clears textarea.

### B.33 Status bar (`components/status-bar.tsx`)

Single line: `Build` or `Plan` (color = primary/planMode) ‹ `›` (dimSeparator color) ‹ `<model id>`.

### B.34 Spinner (`components/spinner.tsx`)

`<spinner name="aesthetic" color={primary|planMode} />` from `opentui-spinner/react`. Color depends on current mode.

### B.35 Border chars (`components/border.tsx`)

```ts
export const EmptyBorder = {
  topLeft: "", bottomLeft: "", vertical: "", topRight: "", bottomRight: "",
  horizontal: " ", bottomT: "", topT: "", cross: "", leftT: "", rightT: ""
};
export const SplitBorderChars = { ...EmptyBorder, vertical: "┃" };
```

Used in: toast (side borders), input bar (left border), user/error messages (left border), bot message (reasoning/tool left border with `vertical: "│"`).

### B.36 Header (`components/header.tsx`)

Two `ascii-font` text "Night" (gray) and "Code" (default color) on one line, centred.

### B.37 Session shell (`components/session-shell.tsx`)

Layout: column with `paddingY=1, paddingX=2, gap=1`.
- `<scrollbox flexGrow=1 stickyScroll stickyStart="bottom">` containing `<box>{children}</box>` (renders message list).
- `<box flexShrink=0>` containing `<InputBar />`.
- Footer row (`flexDirection="row" justifyContent="space-between"`):
  - Left: `<Spinner mode={mode} />` and, if `interruptible`, a `<text>esc to interrupt</text>`.
  - Right: `<text>tab</text> <text attributes={TextAttributes.DIM}>agents</text>` (acts as a hint to open the agents dialog).

### B.38 Messages

`messages/index.tsx` re-exports `ErrorMessage`, `UserMessage`, `BotMessage`.

**`UserMessage`**: full-width box with left border `┃`/`╹` in `primary` (BUILD) or `planMode` (PLAN); inner box `paddingX=2, paddingY=1, backgroundColor=surface`; renders `<text>{message}</text>`.

**`ErrorMessage`**: same shape as UserMessage but `borderColor=colors.error`; text rendered with `TextAttributes.DIM`.

**`BotMessage`**: full-width box, then for each `PartGroup` from `groupConsecutiveParts(parts)`:
- Renders parts in a `<box paddingTop=1 (except first)>`.
- Reasoning part: left border `│` in `thinkingBorder`; dim text `<em fg={thinking}>Thinking:</em> {text}`.
- Tool part (`dynamic-tool` or `tool-*`): left border `│` in `thinkingBorder`; dim text `<em fg={info}><FormattedToolName>:</em> {args}` with `…` if state !== `output-available` and !== `output-error`, plus error text if `output-error`. Tool name formatted from camelCase to "Title Case". Args are `Object.values(input).map(String).join(" ")`.
- Text part: `<box paddingX=3><text>{text}</text></box>`.
- `groupConsecutiveParts(parts)`: merges adjacent parts of the same `type` into a single group (key = `group-tc-<toolCallId>` for tool parts, `group-<type>-<index>` otherwise).
- Footer: `<box paddingX=3 paddingY=1 gap=1>` with a row `[◉ in primary/planMode] [Build/Plan] [›] [model] (› durationMs if set)`. Duration is formatted via `prettyMs`.

`Session` screen wraps each `Message`:
- `user`: extracts text from `parts.filter(p.type==="text").map(p.text).join("")` → `<UserMessage mode={metadata.mode ?? "BUILD"} />`.
- `assistant`: `<BotMessage parts={...} model={metadata.model ?? "unknown"} mode={metadata.mode ?? "BUILD"} durationMs={metadata.durationMs} streaming={false} />`.

### B.39 Home screen

- Centred layout: `<Header />` above a max-width 78 input bar.
- On submit: `navigate("/sessions/new", { state: { message: text, mode, model } })`.
- Footer hint: `tab agents`.

### B.40 New session screen

- Receives location state `{ message, mode, model }` validated by `newSessionStateSchema = z.object({ message, mode: modeSchema, model: z.string() })`.
- Guard: if no state, redirect to `/` (replace).
- On mount: `apiClient.sessions.$post({ json: { title: state.message.slice(0, 100) } })`. On success, `navigate("/sessions/" + session.id, { replace: true, state: { session, initialPrompt: state } })`. On error, toast + redirect to `/`.
- Renders `<SessionShell onSubmit={() => {}} inputDisabled loading>` with `<UserMessage message={state.message} mode={state.mode} />`.

### B.41 Session screen

- Reads `id` param. If `prefetched` session (passed via location state) exists, use it; else `apiClient.sessions[":id"].$get({ param: { id } })`. On error, toast + redirect to `/`.
- `useEffect` cleanup: `void abort()` to stop the pending reply on unmount.
- Escape key (while `isTopLayer("base")` and `status === "streaming"`): `interrupt()`.
- Auto-submits `initialPrompt` once (guarded by `hasSubmittedInitialPromptRef`).
- Renders `<SessionShell onSubmit={(text) => submit({ userText: text, mode, model })} loading={status in ["submitted","streaming"]} interruptible={loading}>`.
- Maps messages to `ChatMessage`; appends `<ErrorMessage message={error.message} />` if any.

### B.42 Keyboard layer usage map

| Layer id | Pushed by | Popped by | Responder behaviour |
|---|---|---|---|
| `base` | always present | never popped (only set/clear responder) | `InputBar`'s responder clears textarea text on ctrl+c |
| `command` | `useCommandMenu` when textarea starts with `/` and no space | `resolveCommand`, escape, content change | closes the command menu |
| `mention` | `InputBar.syncMentionMenu` when mention is active | same (or escape in mention handler) | closes the mention menu |
| `dialog` | `DialogProvider.open` | `close` | calls `close()` |

Only the top layer receives arrow-key / escape / enter keys (each consumer checks `isTopLayer("<own>")`).

### B.43 Tooling & build

- `bun build src/index.tsx --outdir dist --target bun` for CLI.
- `bun build src/index.ts --outdir dist --target bun` for server.
- `bun link` to expose `nightcode` binary.
- Root scripts: `dev:cli` (watch), `dev:server` (hot), `build:cli` (filter), `link:cli` (build + link).
- Server has `postinstall: bun run --cwd ../database db:generate` to generate Prisma client.
- All TS files use extension imports: `import "./auth.ts"` style is NOT used; instead `from "./auth"` and `from "../generated/prisma/client.ts"` in the Prisma re-export.

---

## C. Code patterns (recurring idioms)

### C.1 Type-only env reads
- `process.env.X ?? "default"` for non-required (CLI).
- Hard-throw for required (server: `getRequiredEnv`).

### C.2 hono/client typing end-to-end
- Server exports `AppType = typeof routes`.
- CLI builds `apiClient = hc<AppType>(apiUrl, { fetch })`.
- Endpoint types inferred via `InferResponseType<...>` (used in `SessionsDialogContent` and `Session`).
- Param-typed routes via `apiClient.sessions[":id"].$get({ param: { id } })`.

### C.3 Custom fetch wrapper for auth
- Adds `Authorization: Bearer <token>` and clears auth on 401.

### C.4 AI SDK tools defined once in shared
- `toolInputSchemas` and `tool()` contracts live in `@nightcode/shared/schemas.ts`. Client and server both consume them.
- `ToolContracts = typeof buildToolContracts` so `InferUITools<ToolContracts>` can be used on both sides.

### C.5 JSON-blob session persistence
- The whole message log is stored as a `Json` column. Server merges incoming messages with previous by `id` before streaming.

### C.6 Stream-then-bill pattern
- `streamText` with `onFinish` capturing `totalUsage`. After the response is fully sent, the `onFinish` of `toUIMessageStreamResponse` persists messages and (if not aborted, not pending tool calls, has usage) calls `calculateCreditsForUsage` + `ingestAiUsage`. Credit failures are logged, not thrown.

### C.7 Path sandboxing (client-side tools)
- `resolveInsideCwd(path)` rejects paths whose `relative` form starts with `..` or is absolute. Used by every read/write tool.

### C.8 Layer-stacked keyboard handling
- `KeyboardLayerProvider` exposes a `push/pop/isTopLayer/setResponder` API.
- Each consumer registers a responder on its own layer id.
- A single global `useKeyboard(ctrl+c)` walks the stack top-down.
- Other keys (arrow, enter, escape) are filtered by `isTopLayer("<own>")`.

### C.9 Responder-ref pattern for `onSubmit`
- `<textarea>`'s `onSubmit` is set once via ref; the ref points to a closure that reads the latest state, so the always-stable handler always has fresh state.

### C.10 Mutable ref for latest callback
- `onSubmitRef.current = () => {...}` pattern (InputBar) and `stackRef.current = stack` pattern (KeyboardLayerProvider) to give stable handlers fresh state.

### C.11 Theme persistence via `~/.nightcode/preferences.json`
- Mirrors auth file pattern (`mkdirSync(0o700)`, `writeFileSync`).
- Silently swallowed read/write errors.

### C.12 Auth file `mkdirSync(0o700)` + `writeFileSync(0o600)`
- POSIX owner-only permissions on both `~/.nightcode/` and `auth.json`.

### C.13 OAuth round-trip through server
- CLI never speaks directly to Clerk's token endpoint for the redirect; it serves a local callback, but the actual `code → token` exchange posts to `${clerkFrontendApi}/oauth/token` with `redirect_uri = ${apiUrl}/auth/callback`. The server route at `/auth/callback` only exists to forward `code+state` from the Clerk redirect to the local CLI callback server.

### C.14 Token format
- `clerkClient.authenticateRequest(request, { acceptsToken: "oauth_token" })` — expects a Clerk OAuth bearer token, not a session cookie. Server middleware rejects anything else as 401.

### C.15 Reused border components
- `EmptyBorder` and `SplitBorderChars` are reused by toast, input bar, user message, error message, bot message (with different custom variants like `vertical: "│"` for bot-message internal borders).

### C.16 Reused `DialogSearchList<T>`
- One generic component powers Agents, Models, Sessions, and Themes dialogs.

### C.17 Slash command filter is prefix-based; sub-token filter for mentions and themes is substring
- Commands: `name.toLowerCase().startsWith(query)`.
- Mentions: prefix match on the basename; recursive fallback when no direct match.
- Themes/Models/Agents/Sessions: `name.toLowerCase().includes(query)`.

### C.18 Cents-as-credits
- 1 credit = $0.01. Credits are integer (`Math.ceil(estimatedCostUsd / USD_PER_CREDIT)`, with floor of 1 for any non-zero usage).

### C.19 Error shapes
- All server error responses are `{ error: string }` JSON with appropriate status.
- `getErrorMessage` on the client extracts that, falling back to `statusText` or `Request failed with status N`.

### C.20 Animation
- All animated UI is via the `spinner` component (`opentui-spinner`); no other animated elements.

---

## D. Notable details & quirks

1. **`Mode` import bug in `models-dialog.tsx`**: imports `Mode` from `@nightcode/database/enums` (nonexistent path). `Mode` is unused in the file. TypeScript `strict` + `verbatimModuleSyntax` + `noUnusedLocals: false` (set off in `tsconfig.base.json`) lets it slide, but a parity project should fix it (or just remove the import).

2. **No user/usage tables**: only `Session`. The system assumes Clerk owns identity and Polar owns credits. The `db.session.findMany` and `db.session.findUnique` use `where: { id, userId }` for tenant isolation but never `IN`-join against any users table.

3. **Mock blocks left in `routes/sessions.ts`**: two commented-out sets of mock delays/errors (in `GET /:id` and `POST /`) for tutorial purposes. Includes `// import { HTTPException } from "hono/http-exception";`.

4. **Unused env vars in `.env.example`**: `CLERK_OAUTH_CLIENT_SECRET` and `JWT_SECRET` are documented but not read by any TS file. (Clerk's PKCE flow doesn't require the secret; the comment "PKCE requires `prompt=login` and code_verifier" matches the CLI behaviour.)

5. **`POST /sessions` has no mock**: only `GET /:id` does. The mock blocks are commented out and unlikely to be left in by a parity copy.

6. **`AnthropicModelId` / `OpenAIModelId` / `GeminiModelId` types are declared** in `lib/models.ts` but the switch only handles anthropic/openai; google throws via `assertUnsupportedProvider(never)`. Defensive.

7. **Session-message send logic in `use-chat.ts`**: when the last message is an assistant and the previous is a user, it sends BOTH (the "tool-call round-trip" the server needs to see); otherwise it sends just the last. This is how tool-call responses are replayed to the server.

8. **Client-side tool call resolution**: the LLM never sees file content (only tool args); the actual `readFile` / `glob` / `bash` etc. happen in the CLI process. The server is a pure pass-through for the model + tool schemas. This is the "client-side tool execution" highlighted in the README and tutorial branch 10.

9. **`@opentui/react` `useKeyboard` listeners** are stacked: each provider/component registers its own, and the `KeyboardLayerProvider`'s ctrl+c handler is the only one that walks the stack. Other keys (arrow, escape, enter, return, tab) are filtered by `isTopLayer`.

10. **`exitOnCtrlC: false`** at the renderer level is essential — it gives the `KeyboardLayerProvider` the chance to handle ctrl+c by walking the stack first.

11. **Spinner color is mode-aware** (`Spinner` defaults to BUILD, takes optional `mode` prop; passed `mode` from `SessionShell`). It pulls `primary` (BUILD) or `planMode` (PLAN) from theme.

12. **`useTerminalDimensions`** is used in `Dialog` (for full-screen overlay) and `Toast` (for max width clamp).

13. **Mouse handling on the scrollbox list rows**: every list (`DialogSearchList`, `FileMentionMenu`, `CommandMenu`) wires `onMouseMove` (set selection) + `onMouseDown` (select). They use a custom background color (`colors.selection`) when selected.

14. **`textarea.replaceText` + `cursorOffset` setters** are OpenTUI-specific APIs used by `handleMentionExecute` to atomically rewrite the buffer when a mention is inserted.

15. **Session JSON column deserialization**: `server/src/routes/chat.ts` casts `session.messages as unknown as NightcodeUIMessage[]`; client-side `Session` screen casts `session.messages as unknown as Message[]`. No schema validation against `Message` after loading.

16. **Initial message metadata**: when loading an existing session, the metadata on the user/assistant messages is whatever the server stamped during streaming. The chat hook `prepareSendMessagesRequest` re-uses metadata from any prior message to fill in `mode`/`model` for the next request.

17. **Streaming abort behaviour**: `chat.stop` is aliased to both `abort` and `interrupt`. The server, on receiving an abort, returns `event.isAborted = true` and the persist+billing step is skipped. But the `hasPendingToolCalls` guard also skips persistence if the assistant message has a still-pending tool call — this prevents the DB from getting into a state where a tool call exists with no result.

18. **Pricing comment in `credits.ts`**: 1 credit = $0.01 is intentional ("easy to reason about like cents, while still being granular enough"). Product can change to a finer/coarser unit by editing `USD_PER_CREDIT`.

19. **Polar config in README**: meter name `nightcode_credits`, filter `Name equals nightcode_usage`, aggregation Sum of `credits`. Event sent by `ingestAiUsage` is exactly `name: "nightcode_usage", metadata: { credits }`. Benefit attached to a one-time purchase product. Customer-portal visibility is private (purchases go through API checkout only).

20. **Clerk OAuth scopes**: `openid email profile offline_access` (per README §3). CLI only requests `openid email profile` in the authorize URL — the `offline_access` is mentioned in setup but not in `oauth.ts` (a parity project should add it if matching exact setup).

21. **`/billing/success` text response**: "Done. You can close this tab and return to Nightcode." is the public landing page after Stripe/Polar redirects.

22. **Message ID strategy**: AI SDK `UIMessage` IDs are generated client-side and merged into the session's messages JSON by id. This means clients can be offline/drop and re-send without server-side ID generation, and the server uses the ID for upsert-by-id in its merge loop.

23. **Per-tick scroll-into-view** for command/mention/dialog lists: each handler explicitly adjusts `scrollbox.scrollTo` when the new index goes off-screen in either direction. The viewport height is read from `scrollbox.viewport.height`.

24. **Spinner import in `spinner.tsx`**: `import "opentui-spinner/react"` registers a custom JSX element; combined with `@opentui/react`'s JSX runtime it provides the `<spinner>` element with frame animation.

25. **No `eslint`/`prettier` config** is present in the repo — formatting follows defaults of the author's editor (mixed single/double quotes, semi-colon terminated, 2-space indent, no trailing commas observed, `as const satisfies` for shared registries).

26. **No CI config files** are present in the listing (no `.github/`, no `Dockerfile`, no `railway.json`, no `sentry.config.*` — though the badges reference Sentry and Railway, they are not implemented in this repo).

27. **All four package manifests declare `"private": true`** — Nightcode is not published to npm.

28. **CLI builds to a single Bun-target bundle** (no separate renderer/CLI split). `bun build src/index.tsx --outdir dist --target bun` outputs a runnable bundle that can be linked via `bun link`.

29. **No `bun.lock` content read**, but `package.json` workspaces + the CLI's `devDependencies` on `@nightcode/server` make it clear the link is via Bun's workspace resolver.

30. **The `prisma-client` generator is the new Prisma 7 generator** (not the legacy `prisma-client-js`). Output goes to `../generated/prisma` and the package re-exports from there via `import { PrismaClient } from "../generated/prisma/client.ts";`.

---

## Parity checklist (what to copy verbatim vs adapt)

**Copy verbatim**:
- Tool schemas + AI SDK tool contracts.
- Pricing model + credit math constants.
- Theme list and `ThemeColors` shape.
- Keyboard-layer / dialog / toast / prompt-config / theme provider implementations.
- Border char variants.
- `commandMenu` filtering logic and `TEXTAREA_KEY_BINDINGS`.
- Local tool implementations (`local-tools.ts` — full file).
- Hono route mounts and middleware order.
- `useChat` + `useChat` `onToolCall` pattern.
- `calculateCreditsForUsage` math.
- Polar wrapper functions (createCheckoutUrl, createCustomerPortalUrl, getAvailableCreditsBalance, ingestAiUsage).
- Prisma schema.

**Adapt**:
- Auth choice (Clerk can be swapped for any IdP that supports PKCE + bearer tokens).
- Billing choice (Polar can be swapped; keep the same `getAvailableCreditsBalance` / `ingestAiUsage` interface).
- OpenTUI can be swapped for `ink` or `blessed`; the provider layer is small and self-contained.
- AI SDK provider list (add Google, etc.) — `getToolContracts` is mode-only; provider dispatch is in `lib/models.ts`.

**Bug to fix in your copy**:
- `import { Mode } from "@nightcode/database/enums";` in `models-dialog.tsx` — remove the import entirely.
