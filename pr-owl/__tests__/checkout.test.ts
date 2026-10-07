/**
 * Checkout cache keys.
 *
 * The thing being tested is a hash, which is trivially correct — so the test that
 * matters is the collision that motivated it. A slug of `owner/repo` is not
 * injective, and a collision means reviewing one repository's pull request with
 * another repository's line numbers, which is the worst failure in this app.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cacheKey, cloneUrl } from '../lib/checkout';

describe('cacheKey', () => {
  it('is stable for the same repository', () => {
    assert.equal(cacheKey('https://github.com/acme/api.git'), cacheKey('https://github.com/acme/api.git'));
  });

  it('does not collide the way a slug does', () => {
    // The bug: `acme/api` and `acme-api` both slug to `acme-api`.
    const a = cacheKey('https://github.com/acme/api.git');
    const b = cacheKey('https://github.com/acme-api/api.git');
    assert.notEqual(a, b, 'a hashed key must distinguish these');
  });

  it('ignores the scheme and the .git suffix', () => {
    const expected = cacheKey('https://github.com/acme/api.git');
    assert.equal(cacheKey('http://github.com/acme/api.git'), expected);
    assert.equal(cacheKey('https://github.com/acme/api'), expected);
  });

  it('is filesystem safe regardless of the repository name', () => {
    // No separators, no traversal, nothing that needs quoting.
    for (const url of [
      'https://github.com/acme/api.git',
      'https://github.com/a/b/c.git',
      'https://github.com/acme/../etc.git',
      'https://github.com/acme/api with spaces.git',
    ]) {
      const key = cacheKey(url);
      assert.match(key, /^[0-9a-f]{16}$/, url);
      assert.ok(!key.includes('/') && !key.includes('\\'), url);
      assert.ok(!key.includes('..'), url);
    }
  });

  it('separates different owners of the same repo name', () => {
    assert.notEqual(
      cacheKey('https://github.com/one/api.git'),
      cacheKey('https://github.com/two/api.git'),
    );
  });
});

describe('cloneUrl', () => {
  it('builds a clonable https URL', () => {
    assert.equal(cloneUrl('acme/api'), 'https://github.com/acme/api.git');
  });

  it('round-trips through cacheKey', () => {
    assert.equal(cacheKey(cloneUrl('acme/api')), cacheKey('https://github.com/acme/api'));
  });
});
