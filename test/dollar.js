var test = require('tape');
var expand = require('..');

test('ignores ${', function(t) {
  t.deepEqual(expand('${1..3}'), ['${1..3}']);
  t.end();
});
