const test = require('test');
const assert = require('assert');
const expand = require('..');

test('order', function() {
  assert.deepStrictEqual(expand('a{d,c,b}e'), [
    'ade', 'ace', 'abe'
  ]);
});

