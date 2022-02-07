const test = require('tape');
const expand = require('..');

test('ignores ${', function(t) {
  t.deepEqual(expand('${1..3}'), ['${1..3}']);
  t.deepEqual(expand('${a,b}${c,d}'), ['${a,b}${c,d}']);
  t.deepEqual(expand('${a,b}${c,d}{e,f}'), ['${a,b}${c,d}e','${a,b}${c,d}f']);
  t.deepEqual(expand('{a,b}${c,d}${e,f}'), ['a${c,d}${e,f}','b${c,d}${e,f}']);
  t.deepEqual(expand('{a,b}\\${c,d}\\${e,f}'), ['a$c$e','a$c$f', 'a$d$e', 'a$d$f', 'b$c$e', 'b$c$f', 'b$d$e', 'b$d$f']);
  t.deepEqual(expand('${a,b}${c,d}{1..3}'), ['${a,b}${c,d}1','${a,b}${c,d}2','${a,b}${c,d}3']);
  t.deepEqual(expand('x${a,b}x${c,d}x'), ['x${a,b}x${c,d}x']);
  t.end();
});
