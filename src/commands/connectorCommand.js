/**
 * Connector Command — manage external service connectors.
 *
 * Usage:
 *   sentinel connector list
 *   sentinel connector test <id>
 *   sentinel connector connect <id>
 *   sentinel connector disconnect <id>
 */

import { connectorRegistry } from '../connectors/index.js';

function formatSummary(c) {
  const status = c.connected ? '✅ Connected' : '⭕ Disconnected';
  const lastCheck = c.lastChecked ? ` (last: ${new Date(c.lastChecked).toLocaleTimeString()})` : '';
  const error = c.lastError ? `\n         ❌ ${c.lastError}` : '';
  return `  ${status}${lastCheck}  — ${c.name}\n         ${c.description}${error}`;
}

async function main() {
  // process.argv[2] is first real arg whether invoked directly:
  //   node src/commands/connectorCommand.js list
  // or through CLI dispatch:
  //   sentinel connector list  →  node src/commands/connectorCommand.js list
  const args = process.argv.slice(2);
  const subcommand = args[0]?.toLowerCase();

  switch (subcommand) {
  case 'list': {
    const all = connectorRegistry.list();
    const connected = all.filter(c => c.connected).length;
    console.log('');
    console.log('  ─────────────────────────────────────────────────────');
    console.log('  🔌 Sentinel Connectors');
    console.log('  ─────────────────────────────────────────────────────');
    console.log('');
    console.log(`  Registered: ${all.length}  |  Connected: ${connected}`);
    console.log('');
    for (const c of all) {
      console.log(formatSummary(c));
      console.log('');
    }
    break;
  }

  case 'test': {
    const id = args[1];
    if (!id) {
      console.error('  ❌ Usage: sentinel connector test <id>');
      console.error(`     Available: ${connectorRegistry.availableIds().join(', ')}`);
      process.exit(1);
    }
    const connector = connectorRegistry.get(id);
    if (!connector) {
      console.error(`  ❌ Unknown connector: '${id}'`);
      console.error(`     Available: ${connectorRegistry.availableIds().join(', ')}`);
      process.exit(1);
    }
    console.log(`  Testing connection to ${connector.name}...`);
    const result = await connectorRegistry.check(id);
    if (result.alive) {
      console.log(`  ✅ ${connector.name} — alive (${result.latencyMs}ms)`);
      if (result.details) console.log(`     ${result.details}`);
    } else {
      console.log(`  ❌ ${connector.name} — not reachable`);
      if (result.error) console.log(`     Error: ${result.error}`);
    }
    break;
  }

  case 'connect': {
    const id = args[1];
    if (!id) {
      console.error('  ❌ Usage: sentinel connector connect <id>');
      process.exit(1);
    }
    console.log(`  Connecting to ${id}...`);
    const result = await connectorRegistry.connect(id);
    if (result.success) {
      console.log(`  ✅ ${result.message}`);
    } else {
      console.log(`  ❌ ${result.message}`);
      const schema = connectorRegistry.getConfigSchema(id);
      if (schema?.envVars?.length) {
        console.log(`     Required env vars: ${schema.envVars.join(', ')}`);
      }
      process.exit(1);
    }
    break;
  }

  case 'disconnect': {
    const id = args[1];
    if (!id) {
      console.error('  ❌ Usage: sentinel connector disconnect <id>');
      process.exit(1);
    }
    const result = await connectorRegistry.disconnect(id);
    console.log(`  ${result.success ? '✅' : '❌'} ${result.message}`);
    break;
  }

  default: {
    console.log('');
    console.log('  🔌 Sentinel Connector Manager');
    console.log('');
    console.log('  Usage:');
    console.log('    sentinel connector list              List all connectors');
    console.log('    sentinel connector test <id>         Test connection');
    console.log('    sentinel connector connect <id>      Connect to a service');
    console.log('    sentinel connector disconnect <id>   Disconnect');
    console.log('');
    console.log('  Available connectors:');
    for (const id of connectorRegistry.availableIds()) {
      const c = connectorRegistry.get(id);
      console.log(`    ${id.padEnd(12)} ${c.name}`);
    }
    console.log('');
    break;
  }
  }
}

main().catch(err => {
  console.error('  ❌ Connector command failed:', err.message);
  process.exit(1);
});
