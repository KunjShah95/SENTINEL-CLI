/**
 * Tests for newly created feature modules
 */

import { EnhancedFileOperations, TextEdit, Range } from '../src/utils/enhancedFileOperations.js';
import { EmbeddingProvider } from '../src/utils/embeddingProvider.js';
import { RefactoringEngine } from '../src/utils/refactoringEngine.js';
import { getLanguageAgent } from '../src/agents/languageAgents.js';

describe('Enhanced File Operations', () => {
  it('should create instance without errors', () => {
    const fileOps = new EnhancedFileOperations();
    expect(fileOps).toBeDefined();
    expect(fileOps.basePath).toBeDefined();
  });

  it('should create TextEdit with both signatures', () => {
    // LSP style: TextEdit(range, newText)
    const edit1 = new TextEdit(null, 'new content');
    expect(edit1).toBeDefined();
    expect(edit1.newText).toBe('new content');

    // Pattern replacement style: TextEdit(null, null, oldText, newText)
    const edit2 = new TextEdit(null, null, 'old', 'new');
    expect(edit2.oldText).toBe('old');
    expect(edit2.newText).toBe('new');
  });

  it('should create Range', () => {
    const range = new Range(1, 0, 1, 10);
    expect(range.startLine).toBe(1);
    expect(range.endLine).toBe(1);
  });
});

describe('Embedding Provider', () => {
  it('should create TF-IDF provider', async () => {
    const provider = await EmbeddingProvider.create('tfidf', { vocabularySize: 384 });
    expect(provider).toBeDefined();
    expect(provider.generateEmbedding).toBeDefined();
  });

  it('should generate embedding from text', async () => {
    const provider = await EmbeddingProvider.create('tfidf', { vocabularySize: 384 });
    const embedding = await provider.generateEmbedding('test code');
    expect(embedding).toBeDefined();
    expect(Array.isArray(embedding)).toBe(true);
  });

  it('should export vector utility functions', async () => {
    const { cosineSimilarity, euclideanDistance } = await import('../src/utils/embeddingProvider.js');
    expect(cosineSimilarity).toBeDefined();
    expect(euclideanDistance).toBeDefined();

    const v1 = [1, 0, 0];
    const v2 = [0, 1, 0];
    const sim = cosineSimilarity(v1, v2);
    expect(typeof sim).toBe('number');
  });
});

describe('Refactoring Engine', () => {
  it('should create instance', () => {
    const refactor = new RefactoringEngine(process.cwd());
    expect(refactor).toBeDefined();
    expect(refactor.projectPath).toBeDefined();
  });

  it('should find function references', () => {
    const refactor = new RefactoringEngine();
    const code = 'function myFunc() {} myFunc();';
    const edits = refactor.findFunctionReferences(code, 'myFunc', 'newFunc');
    expect(edits).toBeDefined();
    expect(Array.isArray(edits)).toBe(true);
    expect(edits.length).toBeGreaterThan(0);
  });
});

describe('Language Agents', () => {
  it('should get language agent for javascript', async () => {
    const agent = await getLanguageAgent('javascript');
    expect(agent).toBeDefined();
    expect(agent.parse).toBeDefined();
    expect(agent.analyze).toBeDefined();
    expect(agent.lint).toBeDefined();
  });

  it('should initialize javascript agent', async () => {
    const agent = await getLanguageAgent('javascript');
    await agent.initialize();
    expect(agent.initialized).toBe(true);
  });

  it('should parse javascript code', async () => {
    const agent = await getLanguageAgent('javascript');
    const code = 'const x = 5; function test() { return x; }';
    const result = await agent.parse(code);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('should analyze javascript code', async () => {
    const agent = await getLanguageAgent('javascript');
    const code = 'function myFunc(x) { return x * 2; }';
    const analysis = await agent.analyze(code);
    expect(analysis).toBeDefined();
    expect(analysis.analysis).toBeDefined();
  });

  it('should get python agent', async () => {
    const agent = await getLanguageAgent('python');
    expect(agent).toBeDefined();
  });

  it('should get rust agent', async () => {
    const agent = await getLanguageAgent('rust');
    expect(agent).toBeDefined();
  });
});
