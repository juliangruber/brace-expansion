import test from 'node:test';
import assert from 'assert';
import expand from '../index.js';

test('nested', function() {
  assert.deepStrictEqual(expand('{a,b{1..3},c}'), [
    'a', 'b1', 'b2', 'b3', 'c'
  ]);
  assert.deepStrictEqual(expand('{{A..Z},{a..z}}'),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')
  );
  assert.deepStrictEqual(expand('ppp{,config,oe{,conf}}'), [
    'ppp', 'pppconfig', 'pppoe', 'pppoeconf'
  ]);
});

