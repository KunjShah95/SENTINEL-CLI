import type { CommandContext } from './types.js';

export async function handleVulndb(ctx: CommandContext) {
  const { args: raw, toast, appendMessage, mode, model } = ctx;
  const args = raw.trim();
  try {
    const { VulnerabilityDatabase } = await import('../../security/vulnerability-db/index.js');
    const vdb = new VulnerabilityDatabase();
    await vdb.initialize();

    if (!args || args === 'stats') {
      const stats = vdb.getStats();
      const line = [
        '## Vulnerability Database', '',
        `**${stats.totalPatterns} patterns loaded**`, '',
        '**Severity breakdown:**',
        ...Object.entries(stats.severityBreakdown).map(([k, v]) => `  ${k}: ${v}`), '',
        '**Top tags:**',
        ...(stats.topTags || []).map((t: any) => `  \`${t.tag}\`: ${t.count} patterns`), '',
        `**Languages:** ${stats.languagesCovered.join(', ')}`,
        `**SQLite cache:** ${stats.sqliteEnabled ? '✅ enabled' : '❌ disabled'}`, '',
        '**Commands:**',
        '  `/vulndb search <query>` — Search patterns',
        '  `/vulndb get <id>` — Show pattern details',
        '  `/vulndb tags` — List all tags',
        '  `/vulndb stats` — Show this statistics page',
      ].join('\n');
      appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: line }] });
      vdb.close();
      return;
    }

    if (args.startsWith('search ')) {
      const query = args.slice(7).trim();
      const result = vdb.query({ search: query, limit: 15 });
      if (result.patterns.length === 0) {
        toast.info(`No patterns matching "${query}"`);
        vdb.close();
        return;
      }
      const lines = [`## Search: "${query}" (${result.total} results)`, ''];
      for (const p of result.patterns) {
        lines.push(`**${p.title || p.id}**`);
        lines.push(`  Severity: ${p.severity}  Languages: ${(p.languages || []).join(', ')}`);
        if (p.cwe) lines.push(`  CWE: ${(Array.isArray(p.cwe) ? p.cwe : [p.cwe]).map((c: any) => 'CWE-' + c).join(', ')}`);
        if (p.tags) lines.push(`  Tags: ${p.tags.join(', ')}`);
        lines.push(`  \`/vulndb get ${p.id}\` for details`);
        lines.push('');
      }
      appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: lines.join('\n') }] });
      vdb.close();
      return;
    }

    if (args.startsWith('get ')) {
      const id = args.slice(4).trim();
      const p = vdb.getById(id);
      if (!p) { toast.error(`Pattern "${id}" not found`); vdb.close(); return; }
      const lines = [
        `## ${p.title || p.id}`, '',
        `**Severity:** ${p.severity || 'medium'}`,
        `**Languages:** ${(p.languages || []).join(', ')}`,
        `**CWE:** ${(Array.isArray(p.cwe) ? p.cwe : [p.cwe]).map((c: any) => 'CWE-' + c).join(', ')}`,
        `**OWASP:** ${p.owasp || 'N/A'}`,
        `**Tags:** ${(p.tags || []).join(', ')}`, '',
        ...(p.description ? [`**Description:**`, '', p.description, ''] : []),
        ...(p.detection ? [`**Detection:**`, '', p.detection, ''] : []),
        ...(p.remediation ? [`**Fix:**`, '', p.remediation, ''] : []),
        ...(p.example?.vulnerable ? [`**Vulnerable code:**`, '```', p.example.vulnerable, '```', ''] : []),
        ...(p.example?.fixed ? [`**Fixed code:**`, '```', p.example.fixed, '```'] : []),
      ];
      appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: lines.join('\n') }] });
      vdb.close();
      return;
    }

    if (args === 'tags') {
      const tags = vdb.listTags();
      const sorted = Object.entries(tags).sort((a: any, b: any) => (b[1] as number) - (a[1] as number));
      const lines = ['## Vulnerability Tags', ''];
      for (const [tag, count] of sorted) {
        lines.push(`  \`${tag}\`: ${count} patterns`);
      }
      lines.push('', 'Search: `/vulndb search <tag>`');
      appendMessage({ role: 'assistant', mode, model, parts: [{ type: 'text', text: lines.join('\n') }] });
      vdb.close();
      return;
    }

    toast.error('Usage: /vulndb [stats|search <query>|get <id>|tags]');
    vdb.close();
  } catch (e) { toast.error('VulnDB failed: ' + String(e)); }
}
