import { spawn, type ChildProcess } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, extname } from 'path';

export type LspDiagnostic = {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  severity: 'error' | 'warning' | 'information' | 'hint';
  message: string;
  source?: string;
  code?: string | number;
};

export type LspContext = {
  diagnostics: LspDiagnostic[];
  serverName: string;
  elapsed: number;
};

const SEVERITY_MAP: Record<number, LspDiagnostic['severity']> = {
  1: 'error',
  2: 'warning',
  3: 'information',
  4: 'hint',
};

interface ServerDef {
  cmd: string;
  args: readonly string[];
  languageId: string;
  name: string;
}

const SERVER_MAP: Record<string, ServerDef> = {
  '.ts':  { cmd: 'typescript-language-server', args: ['--stdio'], languageId: 'typescript', name: 'TypeScript' },
  '.tsx': { cmd: 'typescript-language-server', args: ['--stdio'], languageId: 'typescriptreact', name: 'TypeScript' },
  '.js':  { cmd: 'typescript-language-server', args: ['--stdio'], languageId: 'javascript', name: 'TypeScript' },
  '.jsx': { cmd: 'typescript-language-server', args: ['--stdio'], languageId: 'javascriptreact', name: 'TypeScript' },
  '.mjs': { cmd: 'typescript-language-server', args: ['--stdio'], languageId: 'javascript', name: 'TypeScript' },
  '.cjs': { cmd: 'typescript-language-server', args: ['--stdio'], languageId: 'javascript', name: 'TypeScript' },
  '.py':  { cmd: 'pyright-langserver', args: ['--stdio'], languageId: 'python', name: 'Pyright' },
  '.go':  { cmd: 'gopls', args: [], languageId: 'go', name: 'gopls' },
  '.rs':  { cmd: 'rust-analyzer', args: [], languageId: 'rust', name: 'rust-analyzer' },
};

function detectServerForFiles(files: string[]): ServerDef | null {
  for (const file of files) {
    const ext = extname(file);
    const def = SERVER_MAP[ext];
    if (def) return def;
  }
  return null;
}

function encodeMessage(msg: unknown): Buffer {
  const body = JSON.stringify(msg);
  const header = `Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n`;
  return Buffer.concat([Buffer.from(header, 'utf-8'), Buffer.from(body, 'utf-8')]);
}

function pathToUri(filePath: string): string {
  const abs = resolve(filePath);
  const normalized = abs.replace(/\\/g, '/');
  const withScheme = normalized.match(/^[A-Za-z]:/)
    ? '/' + normalized[0].toLowerCase() + normalized.slice(2)
    : normalized;
  return `file://${withScheme}`;
}

function uriToPath(uri: string): string {
  const decoded = decodeURIComponent(uri);
  const m = decoded.match(/^file:\/\/(?:\/[A-Za-z]:)?(\/.+)$/);
  return m ? m[1] : decoded.replace(/^file:\/\//, '');
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class LspSession {
  private proc: ChildProcess;
  private buffer = '';
  private idCounter = 0;
  private pending = new Map<number, PendingRequest>();
  private collected: LspDiagnostic[] = [];

  constructor(
    private server: ServerDef,
    private files: string[],
    private cwd: string,
  ) {
    this.proc = spawn(server.cmd, [...server.args], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    this.proc.stdout!.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf-8')));

    this.proc.on('error', () => {});
    this.proc.on('exit', (code) => {
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`Server exited with code ${code}`));
      }
      this.pending.clear();
    });
  }

  private onData(data: string) {
    this.buffer += data;
    while (true) {
      const match = this.buffer.match(/Content-Length: (\d+)\r\n\r\n/);
      if (!match) break;
      const contentLength = parseInt(match[1], 10);
      const headerEnd = match.index! + match[0].length;
      if (this.buffer.length < headerEnd + contentLength) break;
      const body = this.buffer.slice(headerEnd, headerEnd + contentLength);
      this.buffer = this.buffer.slice(headerEnd + contentLength);
      try {
        this.handleMessage(JSON.parse(body));
      } catch {
        // malformed message — ignore
      }
    }
  }

  private handleMessage(msg: any) {
    if (msg.id != null && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      if (msg.error) {
        p.reject(new Error(msg.error.message || 'LSP error'));
      } else {
        p.resolve(msg.result);
      }
      return;
    }

    if (msg.method === 'textDocument/publishDiagnostics') {
      const fileUri = msg.params?.uri as string | undefined;
      if (!fileUri) return;
      const filePath = uriToPath(fileUri);
      const rawDiags: any[] = msg.params?.diagnostics || [];
      for (const d of rawDiags) {
        this.collected.push({
          file: filePath,
          line: (d.range?.start?.line ?? 0) + 1,
          column: (d.range?.start?.character ?? 0) + 1,
          endLine: d.range?.end?.line != null ? d.range.end.line + 1 : undefined,
          endColumn: d.range?.end?.character != null ? d.range.end.character + 1 : undefined,
          severity: SEVERITY_MAP[d.severity as number] || 'hint',
          message: d.message,
          source: d.source,
          code: d.code,
        });
      }
    }
  }

  private async request(method: string, params: unknown, timeoutMs = 5000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.idCounter;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`LSP "${method}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.proc.stdin!.write(encodeMessage({
          jsonrpc: '2.0',
          id,
          method,
          params,
        }));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private notify(method: string, params: unknown) {
    try {
      this.proc.stdin!.write(encodeMessage({
        jsonrpc: '2.0',
        method,
        params,
      }));
    } catch {
      // ignore send failures
    }
  }

  async run(): Promise<LspDiagnostic[]> {
    try {
      await this.request('initialize', {
        processId: null,
        clientInfo: { name: 'sentinel-cli', version: '2.0.0' },
        capabilities: {
          textDocument: {
            diagnostic: { dynamicRegistration: true },
          },
        },
        rootUri: pathToUri(this.cwd),
        workspaceFolders: [{ uri: pathToUri(this.cwd), name: 'workspace' }],
      });
    } catch {
      return this.collected;
    }

    this.notify('initialized', {});

    for (const file of this.files) {
      let content: string;
      try {
        content = readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      this.notify('textDocument/didOpen', {
        textDocument: {
          uri: pathToUri(file),
          languageId: this.server.languageId,
          version: 1,
          text: content,
        },
      });
    }

    for (const file of this.files) {
      try {
        await this.request('textDocument/diagnostic', {
          textDocument: { uri: pathToUri(file) },
        });
      } catch {
        // Server may not support pull diagnostics — fine
      }
    }

    return this.collected;
  }

  async shutdown() {
    try {
      await this.request('shutdown', null, 2000);
    } catch {
      // ignore
    }
    this.notify('exit', {});
    const killTimer = setTimeout(() => {
      try { this.proc.kill(); } catch { /* ignore */ }
    }, 1000);
    await new Promise<void>((resolve) => {
      this.proc.on('exit', () => {
        clearTimeout(killTimer);
        resolve();
      });
      this.proc.on('error', () => {
        clearTimeout(killTimer);
        resolve();
      });
    });
  }
}

export async function getLspDiagnostics(
  files: string[],
  cwd?: string,
): Promise<LspContext | null> {
  const start = Date.now();
  const workDir = cwd || process.cwd();
  const resolvedFiles = files.map(f => resolve(workDir, f));

  const server = detectServerForFiles(resolvedFiles);
  if (!server) return null;

  let session: LspSession | null = null;
  try {
    session = new LspSession(server, resolvedFiles, workDir);
    const diagnostics = await session.run();
    return {
      diagnostics,
      serverName: server.name,
      elapsed: Date.now() - start,
    };
  } catch {
    return null;
  } finally {
    if (session) {
      await session.shutdown().catch(() => {});
    }
  }
}
