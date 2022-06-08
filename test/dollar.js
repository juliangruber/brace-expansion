const test = require('test');
const assert = require('assert');
const expand = require('..');

test('ignores ${', function() {
  assert.deepStrictEqual(expand('${1..3}'), ['${1..3}']);
  assert.deepStrictEqual(expand('${a,b}${c,d}'), ['${a,b}${c,d}']);
  assert.deepStrictEqual(expand('${a,b}${c,d}{e,f}'), ['${a,b}${c,d}e','${a,b}${c,d}f']);
  assert.deepStrictEqual(expand('{a,b}${c,d}${e,f}'), ['a${c,d}${e,f}','b${c,d}${e,f}']);
  assert.deepStrictEqual(expand('${a,b}${c,d}{1..3}'), ['${a,b}${c,d}1','${a,b}${c,d}2','${a,b}${c,d}3']);
  assert.deepStrictEqual(expand('x${a,b}x${c,d}x'), ['x${a,b}x${c,d}x']);
});
