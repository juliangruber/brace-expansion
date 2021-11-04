const test = require('tape');
const expand = require('..');

test('empty option', function(t) {
  t.deepEqual(expand('-v{,,,,}'), [
    '-v', '-v', '-v', '-v', '-v'
  ]);
  t.end();
});

