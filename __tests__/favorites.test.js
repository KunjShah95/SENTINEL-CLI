/**
 * favourites + recents — the pure list handling behind ctrl+f, f2 and the
 * favourites-only filter.
 *
 * Run with: node --test __tests__/favorites.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECENT_LIMIT,
  cycleModel,
  favoritesFirst,
  recordRecent,
  toggleFavorite,
} from '../src/shared/models/favorites.js';

const m = (id) => ({ id, provider: 'anthropic', label: id });

describe('toggleFavorite', () => {
  it('stars, then unstars', () => {
    const starred = toggleFavorite([], 'a');
    assert.deepEqual(starred, ['a']);
    assert.deepEqual(toggleFavorite(starred, 'a'), []);
  });

  it('puts the newest star first', () => {
    let list = toggleFavorite([], 'a');
    list = toggleFavorite(list, 'b');
    list = toggleFavorite(list, 'c');
    assert.deepEqual(list, ['c', 'b', 'a']);
  });

  it('unstars in place, leaving the rest of the order alone', () => {
    const list = toggleFavorite(['c', 'b', 'a'], 'b');
    assert.deepEqual(list, ['c', 'a']);
  });

  it('is a no-op on an empty id rather than starring undefined', () => {
    assert.deepEqual(toggleFavorite(['a'], ''), ['a']);
    assert.deepEqual(toggleFavorite(['a'], null), ['a']);
  });

  it('does not mutate its input', () => {
    const original = ['a'];
    toggleFavorite(original, 'b');
    assert.deepEqual(original, ['a']);
  });

  it('tolerates a missing list, which is what a fresh install has', () => {
    assert.deepEqual(toggleFavorite(undefined, 'a'), ['a']);
  });
});

describe('recordRecent', () => {
  it('puts a new model at the front', () => {
    assert.deepEqual(recordRecent(['b'], 'a'), ['a', 'b']);
  });

  it('moves an existing model to the front instead of duplicating it', () => {
    // The regression this guards: appending would leave the same model at both
    // ends, so f2 would appear to do nothing at all.
    assert.deepEqual(recordRecent(['c', 'b', 'a'], 'c'), ['c', 'b', 'a']);
  });

  it('caps the list, dropping the oldest', () => {
    let list = [];
    for (const id of ['a', 'b', 'c', 'd']) list = recordRecent(list, id, 3);
    assert.deepEqual(list, ['d', 'c', 'b']);
  });

  it('caps at RECENT_LIMIT by default', () => {
    let list = [];
    for (let i = 0; i < RECENT_LIMIT + 5; i++) list = recordRecent(list, `m${i}`);
    assert.equal(list.length, RECENT_LIMIT);
    assert.equal(list[0], `m${RECENT_LIMIT + 4}`);
  });

  it('ignores an empty id', () => {
    assert.deepEqual(recordRecent(['a'], ''), ['a']);
  });
});

describe('cycleModel', () => {
  const recents = ['c', 'b', 'a'];

  it('steps forward from the current model', () => {
    assert.equal(cycleModel(recents, 'c', 1), 'b');
    assert.equal(cycleModel(recents, 'b', 1), 'a');
  });

  it('steps backward', () => {
    assert.equal(cycleModel(recents, 'b', -1), 'c');
  });

  it('wraps at both ends', () => {
    assert.equal(cycleModel(recents, 'a', 1), 'c');
    assert.equal(cycleModel(recents, 'c', -1), 'a');
  });

  it('walks the whole ring and returns to the start', () => {
    let current = 'c';
    const seen = [current];
    // Three steps over a three-model ring: one full lap back to where it began.
    for (let i = 0; i < 3; i++) {
      current = cycleModel(recents, current, 1);
      seen.push(current);
    }
    assert.deepEqual(seen, ['c', 'b', 'a', 'c']);
  });

  it('returns null when there is nothing to step to', () => {
    // A caller that treats null as "stay put" is right; one that treats it as
    // index 0 would silently jump to the newest model on every stray f2.
    assert.equal(cycleModel([], 'a', 1), null);
    assert.equal(cycleModel(['a'], 'a', 1), null, 'only one model in the ring');
    assert.equal(cycleModel(recents, 'not-in-list', 1), null);
  });

  it('tolerates a missing list', () => {
    assert.equal(cycleModel(undefined, 'a', 1), null);
  });
});

describe('favoritesFirst', () => {
  const catalog = [m('a'), m('b'), m('c'), m('d')];

  it('hoists favourites to the front', () => {
    // Favourites keep the catalog's own ranking among themselves (a before c),
    // not the order they were starred in. The catalog arrives ranked and the
    // best model of your favourites should still lead them.
    assert.deepEqual(favoritesFirst(catalog, ['c', 'a']).map(x => x.id), ['a', 'c', 'b', 'd']);
  });

  it('keeps every other row in its original relative order', () => {
    // A stable partition, not a sort: the catalog arrives ranked, and re-sorting
    // would throw that ranking away for every non-favourite.
    const out = favoritesFirst(catalog, ['b']).map(x => x.id);
    assert.deepEqual(out, ['b', 'a', 'c', 'd']);
  });

  it('is a no-op with no favourites', () => {
    assert.equal(favoritesFirst(catalog, []), catalog);
    assert.equal(favoritesFirst(catalog, undefined), catalog);
  });

  it('ignores favourites that are not in the catalog', () => {
    // A star for a model the current catalog does not carry — a provider that
    // went away, or a model that has not been discovered yet. It must not
    // consume a slot or reorder anything.
    assert.deepEqual(favoritesFirst(catalog, ['zzz']).map(x => x.id), ['a', 'b', 'c', 'd']);
  });

  it('does not mutate its input', () => {
    const original = [m('a'), m('b')];
    favoritesFirst(original, ['b']);
    assert.deepEqual(original.map(x => x.id), ['a', 'b']);
  });
});
