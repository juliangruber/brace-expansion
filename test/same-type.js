const test = require('test');
const assert = require('assert');
const expand = require('..');

test('x and y of same type', function() {
  assert.deepStrictEqual(expand('{a..9}'), ['{a..9}']);
});
