/**
 * Per-turn tool scope — the `allowed-tools` frontmatter key, enforced.
 *
 * The behaviour these lock down is mostly about *how* a restriction is
 * expressed, not about what it permits. Narrowing the advertised toolset was
 * the obvious implementation and it is wrong: a skill is loaded mid-turn, so
 * removing tools the model was already shown makes its next call fail against a
 * list it has never seen — which presents as an agent that has forgotten how to
 * read files. So the call is refused, by name, with the binding skill named.
 *
 * The composition rule is the other half worth pinning: two loaded skills
 * *intersect*. A union would let an unrestricted skill widen a restricted one,
 * which is the whole failure mode of the alternative.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSkillScope,
  noteSkillLoaded,
  activeConstraints,
  effectiveAllowedTools,
  checkSkillScope,
} from '../src/agent/skill-scope.js';

const skill = (name, allowed) =>
  allowed === undefined ? { name, description: 'd', allowedTools: '' } : { name, description: 'd', allowedTools: allowed };

describe('a skill may narrow the rest of its turn', () => {
  it('imposes nothing until a skill declares something', () => {
    const scope = createSkillScope();
    assert.equal(checkSkillScope(scope, 'writeFile'), null);
    assert.deepEqual(activeConstraints(scope), []);
    assert.equal(effectiveAllowedTools(scope), null);
  });

  it('a loaded skill without a declaration constrains nothing', () => {
    // Otherwise every skill would silently become a restriction, and the key
    // would be a trap for anyone who did not know to omit it.
    const scope = noteSkillLoaded(createSkillScope(), skill('plain'));
    assert.equal(checkSkillScope(scope, 'writeFile'), null);
    assert.deepEqual(activeConstraints(scope), []);
  });

  it('refuses a tool the declaration excludes, and names the skill', () => {
    const scope = noteSkillLoaded(createSkillScope(), skill('audit', 'readFile, grep'));
    assert.equal(checkSkillScope(scope, 'readFile'), null, 'a permitted tool passes');
    const refusal = checkSkillScope(scope, 'writeFile');
    assert.match(refusal.reason, /"audit"/, 'the binding skill is named');
    // Sorted for stability, so the message is the same every run.
    assert.match(refusal.reason, /grep, readFile/, 'what is permitted is listed');
    assert.equal(refusal.gate, 'skillScope');
  });

  it('always permits the skill tool itself', () => {
    // A skill that could not load another skill would be a one-way door, and a
    // restriction that blocks its own escape hatch is a trap, not a policy.
    const scope = noteSkillLoaded(createSkillScope(), skill('narrow', 'readFile'));
    assert.equal(checkSkillScope(scope, 'skill'), null);
  });

  it('two loaded skills intersect rather than unite', () => {
    // The union alternative lets a skill with no declaration hand another
    // skill's restriction back, which is exactly what the key exists to stop.
    const scope = createSkillScope();
    noteSkillLoaded(scope, skill('audit', 'readFile, grep'));
    noteSkillLoaded(scope, skill('fixer', 'grep, writeFile'));
    assert.deepEqual([...effectiveAllowedTools(scope)], ['grep']);
    assert.equal(checkSkillScope(scope, 'grep'), null, 'in the intersection');
    assert.ok(checkSkillScope(scope, 'readFile'), 'only in audit — refused');
    assert.ok(checkSkillScope(scope, 'writeFile'), 'only in fixer — refused');
    assert.match(checkSkillScope(scope, 'writeFile').reason, /"audit" and "fixer"/);
  });

  it('an unrestricted skill cannot widen a restricted one', () => {
    const scope = createSkillScope();
    noteSkillLoaded(scope, skill('audit', 'readFile'));
    noteSkillLoaded(scope, skill('open', ''));
    assert.ok(checkSkillScope(scope, 'writeFile'), 'still refused');
  });

  it('records a skill once, however many times it is loaded', () => {
    const scope = createSkillScope();
    noteSkillLoaded(scope, skill('audit', 'readFile, grep'));
    noteSkillLoaded(scope, skill('audit', 'readFile, grep'));
    assert.equal(activeConstraints(scope).length, 1);
  });

  it('ignores a record with no usable name', () => {
    const scope = createSkillScope();
    noteSkillLoaded(scope, null);
    noteSkillLoaded(scope, { description: 'no name' });
    assert.deepEqual(activeConstraints(scope), []);
  });

  it('a null scope is inert, not a crash', () => {
    // The loop constructs this per turn; a caller that has not should get "no
    // restriction" rather than a TypeError inside a gate.
    assert.equal(checkSkillScope(null, 'writeFile'), null);
    assert.deepEqual(activeConstraints(null), []);
    assert.equal(effectiveAllowedTools(null), null);
  });
});
