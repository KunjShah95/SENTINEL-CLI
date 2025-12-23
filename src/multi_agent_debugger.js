/*
 * src/multi_agent_debugger.js
 * Minimal scaffold for a multi-agent debugging workflow using the OpenAI SDK.
 * - ScannerAgent: finds issues in source
 * - FixerAgent: suggests minimal fixes
 * - ValidatorAgent: checks whether fixes resolve the issues
 *
 * Note: Adjust model names and SDK calls to match the OpenAI SDK version in use.
 */

import OpenAI from 'openai';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class ScannerAgent {
  constructor(client) { this.client = client; }

  async run(code) {
    const prompt = `You are a scanner that finds bugs, edge-cases and TODOs in the given code.\n\nCode:\n${code}\n\nRespond with a JSON array of findings where each finding has {file, line, issue, snippet}.`;
    const res = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
    });

    const text = res.choices?.[0]?.message?.content ?? res.output?.[0]?.content?.[0]?.text ?? "";
    try { return JSON.parse(text); } catch (e) { return [{ issue: text }]; }
  }
}

class FixerAgent {
  constructor(client) { this.client = client; }

  async run(finding, originalCode) {
    const prompt = `You are a fixer. Apply a minimal, well-tested fix to the code based on this finding: ${JSON.stringify(finding)}.\nReturn the full updated file content only.\n\nOriginal:\n${originalCode}`;
    const res = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
    });

    const updated = res.choices?.[0]?.message?.content ?? res.output?.[0]?.content?.[0]?.text ?? "";
    return updated;
  }
}

class ValidatorAgent {
  constructor(client) { this.client = client; }

  async run(fixedCode) {
    const prompt = `You are a validator. Determine whether the following changes fix the reported issues. Provide a JSON object: { valid: boolean, details: string }.\n\nCode:\n${fixedCode}`;
    const res = await this.client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
    });

    const text = res.choices?.[0]?.message?.content ?? res.output?.[0]?.content?.[0]?.text ?? "";
    try { return JSON.parse(text); } catch (e) { return { valid: false, details: text }; }
  }
}

async function runDebugCycle(filePath, fileContent) {
  const scanner = new ScannerAgent(client);
  const fixer = new FixerAgent(client);
  const validator = new ValidatorAgent(client);

  const findings = await scanner.run(fileContent);
  const results = [];
  for (const f of findings) {
    const fixed = await fixer.run(f, fileContent);
    const validation = await validator.run(fixed);
    results.push({ finding: f, fixed, validation });
  }
  return results;
}

export { runDebugCycle, ScannerAgent, FixerAgent, ValidatorAgent };
