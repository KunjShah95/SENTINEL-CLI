#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import chalk from "chalk";
import { getAuth } from "../../server/api/client.js";

const CONFIG_DIR =
  process.env.SENTINEL_HOME ||
  path.join(process.env.HOME || process.env.USERPROFILE || ".", ".sentinel");

export function runWhoami() {
  const auth = getAuth();

  if (!auth?.userId) {
    console.log(chalk.yellow("Not logged in."));
    console.log(chalk.gray("Run ") + chalk.bold("sentinel login") + chalk.gray(" to authenticate."));
    process.exit(1);
  }

  console.log(chalk.cyan(auth.userId));
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  pathToFileURL(process.argv[1]).href === import.meta.url &&
  fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  runWhoami();
}

export default runWhoami;
