var test = require('tape');
var expand = require('..');

test('backslashes', function(t) {
  t.deepEqual(expand('{a,\\,c}'), [
    'a', '\\', 'c'
  ]);
  t.end();
});
