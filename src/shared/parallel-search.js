/** Anonymous Parallel Search MCP, used only when explicitly selected. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { composeAbort } from '../utils/abort.js';
import { getVersion } from '../version.js';

const ENDPOINT = 'https://search.parallel.ai/mcp';
const CLIENT_INFO = { name: 'sentinel-cli', version: getVersion() };

export async function searchParallel(query, count, signal, timeoutMs = 12_000) {
  const deadline = composeAbort(signal, timeoutMs);
  const client = new Client(CLIENT_INFO, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    // Include the project identity on initialization, notifications and search.
    // The shared deadline also covers connection setup and response bodies.
    fetch: (url, init) => {
      const headers = new Headers(init?.headers);
      headers.set('user-agent', `sentinel-cli/${CLIENT_INFO.version}`);
      return fetch(url, { ...init, headers });
    },
  });
  const onAbort = () => { client.close().catch(() => {}); };
  deadline.signal.addEventListener('abort', onAbort, { once: true });
  try {
    if (deadline.signal.aborted) throw new Error('Search cancelled');
    await client.connect(transport);
    const result = await client.callTool({
      name: 'web_search',
      arguments: { objective: query, search_queries: [query] },
    }, undefined, { signal: deadline.signal, timeout: timeoutMs });
    const text = (result.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    if (result.isError) throw new Error(text || 'Parallel search failed');
    const data = result.structuredContent ?? JSON.parse(text);
    if (!Array.isArray(data?.results)) throw new Error('Invalid Parallel search response');
    return data.results.filter((r) => {
      try { return ['http:', 'https:'].includes(new URL(r.url).protocol); }
      catch { return false; }
    }).slice(0, count).map((r) => ({
      title: r.title || r.url,
      url: r.url,
      snippet: Array.isArray(r.excerpts) ? r.excerpts.filter((s) => typeof s === 'string').join('\n') : '',
      publishedDate: r.publish_date || undefined,
      provider: 'parallel',
    }));
  } catch (error) {
    if (deadline.aborted()) throw new Error('Search cancelled');
    if (deadline.timedOut()) throw new Error(`Search provider timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    deadline.signal.removeEventListener('abort', onAbort);
    deadline.dispose();
    await client.close().catch(() => {});
  }
}
