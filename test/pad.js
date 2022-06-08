const test = require('test');
const assert = require('assert');
const expand = require('..');

test('pad', function() {
  assert.deepStrictEqual(expand('{9..11}'), [
    '9', '10', '11'
  ]);
  assert.deepStrictEqual(expand('{09..11}'), [
    '09', '10', '11'
  ]);
});

