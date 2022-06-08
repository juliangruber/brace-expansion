const test = require('test');
const assert = require('assert');
const expand = require('..');

test('negative increment', function() {
  assert.deepStrictEqual(expand('{3..1}'), ['3', '2', '1']);
  assert.deepStrictEqual(expand('{10..8}'), ['10', '9', '8']);
  assert.deepStrictEqual(expand('{10..08}'), ['10', '09', '08']);
  assert.deepStrictEqual(expand('{c..a}'), ['c', 'b', 'a']);

  assert.deepStrictEqual(expand('{4..0..2}'), ['4', '2', '0']);
  assert.deepStrictEqual(expand('{4..0..-2}'), ['4', '2', '0']);
  assert.deepStrictEqual(expand('{e..a..2}'), ['e', 'c', 'a']);
});
