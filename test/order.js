const test = require('tape');
const expand = require('..');

test('order', function(t) {
  t.deepEqual(expand('a{d,c,b}e'), [
    'ade', 'ace', 'abe'
  ]);
  t.end();
});

