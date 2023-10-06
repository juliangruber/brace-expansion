import test from 'node:test';
import assert from 'assert';
import expand from '../index.js';

test('pad', function() {
  assert.deepStrictEqual(expand('{9..11}'), [
    '9', '10', '11'
  ]);
  assert.deepStrictEqual(expand('{09..11}'), [
    '09', '10', '11'
  ]);
});

