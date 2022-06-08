const test = require('test');
const assert = require('assert');
const expand = require('..');

test('empty option', function() {
  assert.deepStrictEqual(expand('-v{,,,,}'), [
    '-v', '-v', '-v', '-v', '-v'
  ]);
});

