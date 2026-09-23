import assert from 'node:assert/strict';
import { sumTo } from './sum.mjs';

assert.equal(sumTo(5), 15);
assert.equal(sumTo(100), 5050);
console.log('sums ok');
