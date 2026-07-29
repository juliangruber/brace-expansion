var test = require('tape');
var expand = require('..');

test('ignores ${', function(t) {
  t.deepEqual(expand('${1..3}'), ['${1..3}']);
  t.deepEqual(expand('${a,b}${c,d}'), ['${a,b}${c,d}']);
  // `${` suppresses expansion of the rest of the string on the 1.x line,
  // unlike 2.x and 5.x where the tail still expands.
  t.deepEqual(expand('${a,b}${c,d}{e,f}'), ['${a,b}${c,d}{e,f}']);
  t.deepEqual(expand('${a,b}${c,d}{1..3}'), ['${a,b}${c,d}{1..3}']);
  t.deepEqual(expand('{a,b}${c,d}${e,f}'), ['a${c,d}${e,f}','b${c,d}${e,f}']);
  t.deepEqual(expand('x${a,b}x${c,d}x'), ['x${a,b}x${c,d}x']);
  t.end();
});
