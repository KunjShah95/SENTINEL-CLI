#!/usr/bin/env node

// Sentinel CLI - Redirects to TUI
// All functionality is now in src/tui/modernTui.js

import { ModernTUI } from '../tui/modernTui.js';

const args = process.argv.slice(2);

if (args.length === 0) {
  // No arguments - launch TUI
  const tui = new ModernTUI();
  tui.init().catch(console.error);
} else {
  // Has arguments - run command via TUI
  const tui = new ModernTUI();
  tui.init().then(() => {
    // Run the command
    const command = args[0];
    const commandArgs = args.slice(1);
    return tui.runCommand(command, commandArgs);
  }).then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
