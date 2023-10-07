import test from 'node:test';
import assert from 'assert';
import expand from '../index.js';

test('x and y of same type', function() {
  assert.deepStrictEqual(expand('{a..9}'), ['{a..9}']);
});
