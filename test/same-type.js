const test = require('tape');
const expand = require('..');

test('x and y of same type', function(t) {
  t.deepEqual(expand('{a..9}'), ['{a..9}']);
  t.end();
});
