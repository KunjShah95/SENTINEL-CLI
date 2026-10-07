/**
 * mcp-server — black-box test of the real MCP server over stdio.
 *
 * Spawns mcp/sentinel-mcp-server.js, runs the MCP initialize handshake,
 * and asserts tools/list exposes exactly the three documented tools.
 * No API key or network needed (listing tools never calls an LLM).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = join(root, 'mcp', 'sentinel-mcp-server.js');

function rpc(method, params, id) {
  const msg = { jsonrpc: '2.0', method, ...(id === undefined ? {} : { id }) };
  if (params !== undefined) msg.params = params;
  return JSON.stringify(msg) + '\n';
}

async function listTools() {
  const child = spawn(process.execPath, [serverEntry], {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const kill = () => {
    if (!child.killed) child.kill();
  };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      kill();
      reject(new Error('timed out waiting for tools/list response'));
    }, 20000);

    let buffer = '';
    let step = 0; // 0 = sent initialize, 1 = sent tools/list
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (step === 0 && msg.id === 1) {
          child.stdin.write(rpc('notifications/initialized'));
          child.stdin.write(
            rpc('tools/list', {}, 2)
          );
          step = 1;
        } else if (step === 1 && msg.id === 2) {
          clearTimeout(timer);
          kill();
          resolve(msg.result?.tools ?? []);
        }
      }
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.stdin.write(
      rpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'sentinel-smoke', version: '0.0.0' },
      }, 1)
    );
  });
}

describe('mcp server (stdio)', () => {
  it('lists the documented tools', async () => {
    const tools = await listTools();
    const names = tools.map((t) => t.name).sort();
    // The set grew from three to six as Sentinel became a full participant:
    // web search/fetch, skills discovery, and external MCP server introspection.
    assert.deepEqual(names, [
      'sentinel_ask',
      'sentinel_health',
      'sentinel_mcp_servers',
      'sentinel_review_diff',
      'sentinel_search',
      'sentinel_skills',
    ]);
    for (const t of tools) {
      assert.match(t.name, /^sentinel_/);
      assert.ok(t.description && t.description.length > 0, `${t.name} has a description`);
    }
  });

  it('sentinel_ask declares question/allowBuild/model params', async () => {
    const tools = await listTools();
    const ask = tools.find((t) => t.name === 'sentinel_ask');
    const props = ask.inputSchema?.properties ?? {};
    assert.ok(props.question, 'question param declared');
    assert.ok('allowBuild' in props, 'allowBuild param declared');
  });

  it('sentinel_search accepts both a query and a url', async () => {
    const tools = await listTools();
    const search = tools.find((t) => t.name === 'sentinel_search');
    const props = search.inputSchema?.properties ?? {};
    assert.ok('query' in props, 'query param declared');
    assert.ok('url' in props, 'url param declared');
  });
});
