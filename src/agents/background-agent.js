/**
 * Background Agent — run long-horizon agent tasks asynchronously.
 *
 * Inspired by Cursor 3's cloud agents. The user launches via
 * `/background <prompt>` and checks status with `/agents`.
 * Logs are written to `.sentinel/agents/<id>.log`.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { mkdirSync, existsSync } from "node:fs";
import LLMOrchestrator from "../llm/llmOrchestrator.js";

const AGENTS_DIR = ".sentinel/agents";
const activeAgents = new Map();

function getAgentsRoot() {
  return path.resolve(process.cwd(), AGENTS_DIR);
}

/**
 * @typedef {Object} AgentStatus
 * @property {string} id
 * @property {string} prompt
 * @property {'running' | 'completed' | 'failed' | 'cancelled'} status
 * @property {string} [result]
 * @property {string} [error]
 * @property {number} startedAt
 * @property {number} [completedAt]
 */

export class BackgroundAgent {
  constructor({ id, prompt, systemPrompt, providers }) {
    this.id = id || `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.prompt = prompt;
    this.systemPrompt = systemPrompt || "You are Sentinel CLI, an autonomous coding assistant. Complete the task thoroughly.";
    this.status = "running";
    this.result = null;
    this.error = null;
    this.log = [];
    this.startedAt = Date.now();
    this.completedAt = null;

    this.orchestrator = new LLMOrchestrator({
      providers: providers || [],
    });
  }

  /**
   * Start the agent. Returns immediately; the work happens asynchronously.
   */
  start() {
    activeAgents.set(this.id, this);
    this._run().catch((err) => {
      this.status = "failed";
      this.error = err.message;
      this.completedAt = Date.now();
      this._writeLog();
    });
    return this.id;
  }

  async _run() {
    this._appendLog(`[START] ${new Date().toISOString()} — "${this.prompt}"`);

    try {
      const response = await this.orchestrator.chat(this.prompt, {
        systemPrompt: this.systemPrompt,
      });

      this.result = response.text;
      this.status = "completed";
      this._appendLog(`[RESULT] ${this.result}`);
    } catch (err) {
      this.status = "failed";
      this.error = err.message;
      this._appendLog(`[ERROR] ${err.message}`);
    }

    this.completedAt = Date.now();
    this._appendLog(`[DONE] ${new Date().toISOString()} — status: ${this.status}`);
    await this._writeLog();
  }

  cancel() {
    this.status = "cancelled";
    this.completedAt = Date.now();
    this._appendLog(`[CANCELLED] ${new Date().toISOString()}`);
    this._writeLog();
  }

  _appendLog(entry) {
    this.log.push(entry);
  }

  async _writeLog() {
    const root = getAgentsRoot();
    if (!existsSync(root)) {
      mkdirSync(root, { recursive: true });
    }
    const logPath = path.join(root, `${this.id}.log`);
    await fs.writeFile(logPath, this.log.join("\n") + "\n", "utf-8");
  }

  toJSON() {
    return {
      id: this.id,
      prompt: this.prompt.slice(0, 100),
      status: this.status,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      elapsed: this.completedAt
        ? `${((this.completedAt - this.startedAt) / 1000).toFixed(1)}s`
        : `${((Date.now() - this.startedAt) / 1000).toFixed(1)}s (running)`,
    };
  }
}

/**
 * Launch a background agent.
 * @param {string} prompt
 * @param {object} [opts]
 * @returns {BackgroundAgent}
 */
export function launchBackgroundAgent(prompt, opts = {}) {
  const agent = new BackgroundAgent({ prompt, ...opts });
  agent.start();
  return agent;
}

/**
 * List all active and recently completed agents.
 * @returns {AgentStatus[]}
 */
export function listAgents() {
  return Array.from(activeAgents.values()).map((a) => a.toJSON());
}

/**
 * Get a specific agent by ID.
 * @param {string} id
 * @returns {BackgroundAgent | undefined}
 */
export function getAgent(id) {
  return activeAgents.get(id);
}
