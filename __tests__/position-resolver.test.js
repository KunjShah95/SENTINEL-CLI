import { CommentPositionResolver } from '../src/resolvers/position-resolver.js';

describe('CommentPositionResolver', () => {
  const resolver = new CommentPositionResolver();

  const makeDiff = (oldStart, newStart, lines) => {
    return `@@ -${oldStart},${lines.length} +${newStart},${lines.length} @@\n` + lines.join('\n');
  };

  test('resolves comment in new-side context lines', async () => {
    const diff = makeDiff(10, 10, [
      ' line1',
      ' line2',
      ' line3',
    ]);
    const result = await resolver.resolveComment(diff, { existingCode: 'line2' });
    expect(result.startLine).toBe(11);
    expect(result.method).toBe('new-side');
    expect(result.confidence).toBe('high');
  });

  test('resolves comment in added lines', async () => {
    const diff = makeDiff(10, 10, [
      ' line1',
      '+new line',
      ' line3',
    ]);
    const result = await resolver.resolveComment(diff, { existingCode: 'new line' });
    expect(result.startLine).toBe(11);
    expect(result.method).toBe('new-side');
  });

  test('resolves comment in old-side (deleted) lines', async () => {
    const diff = makeDiff(10, 10, [
      ' line1',
      '-old line',
      ' line3',
    ]);
    const result = await resolver.resolveComment(diff, { existingCode: 'old line' });
    expect(result.startLine).toBe(11);
    expect(result.method).toBe('old-side');
  });

  test('resolves multi-line existingCode across consecutive lines', async () => {
    const diff = makeDiff(5, 5, [
      ' foo() {',
      '+  const x = 1;',
      '+  const y = 2;',
      '   return x + y;',
      ' }',
    ]);
    const result = await resolver.resolveComment(diff, { existingCode: 'const x = 1;\nconst y = 2;' });
    expect(result.startLine).toBe(6);
    expect(result.endLine).toBe(7);
    expect(result.confidence).toBe('high');
  });

  test('returns low confidence when no match found and no LLM client', async () => {
    const diff = makeDiff(1, 1, [' line1']);
    const result = await resolver.resolveComment(diff, { existingCode: 'nonexistent code here' });
    expect(result.confidence).toBe('none');
    expect(result.method).toBe('failed');
  });

  test('handles empty existingCode gracefully', async () => {
    const diff = makeDiff(1, 1, [' line1']);
    const result = await resolver.resolveComment(diff, { existingCode: '' });
    expect(result.startLine).toBeNull();
    expect(result.method).toBe('empty');
  });

  test('parses hunks correctly from real diff format', async () => {
    const diff = [
      '@@ -15,7 +15,8 @@',
      '   const result = await someFunction();',
      ' ',
      '-  return result;',
      '+  return result.map(item => item.value);',
      '+}',
      ' ',
      ' async function otherFunc() {',
    ].join('\n');
    const result = await resolver.resolveComment(diff, { existingCode: 'return result.map(item => item.value);' });
    expect(result.startLine).toBe(17);
    expect(result.confidence).toBe('high');
  });

  test('normalize handles whitespace variance', async () => {
    const diff = makeDiff(1, 1, [
      '  const  x  =  1;',
    ]);
    const result = await resolver.resolveComment(diff, { existingCode: 'const x = 1;' });
    expect(result.startLine).toBe(1);
    expect(result.confidence).toBe('high');
  });

  test('parses hunk with proper line accounting', () => {
    const diff = [
      '@@ -10,6 +10,7 @@',
      ' unchanged',
      '-removed',
      '+added',
      ' unchanged2',
    ].join('\n');
    const hunks = resolver._parseHunks(diff);
    expect(hunks.length).toBe(1);
    expect(hunks[0].lines.length).toBe(4);
    expect(hunks[0].lines[0].type).toBe('context');
    expect(hunks[0].lines[1].type).toBe('deleted');
    expect(hunks[0].lines[2].type).toBe('added');
    expect(hunks[0].lines[3].type).toBe('context');
  });

  test('extractNewLines returns context and added lines with correct numbers', () => {
    const diff = [
      '@@ -10,6 +10,7 @@',
      ' context1',
      '-removed',
      '+added1',
      ' context2',
      '+added2',
    ].join('\n');
    const hunks = resolver._parseHunks(diff);
    const newLines = resolver._extractNewLines(hunks);
    expect(newLines.length).toBe(4);
    expect(newLines[0]).toEqual({ content: 'context1', lineNumber: 10 });
    expect(newLines[1]).toEqual({ content: 'added1', lineNumber: 11 });
    expect(newLines[2]).toEqual({ content: 'context2', lineNumber: 12 });
    expect(newLines[3]).toEqual({ content: 'added2', lineNumber: 13 });
  });
});
