const test = require('test');
const assert = require('assert');
const expand = require('..');

test('numeric sequences', function() {
  assert.deepStrictEqual(expand('a{1..2}b{2..3}c'), [
    'a1b2c', 'a1b3c', 'a2b2c', 'a2b3c'
  ]);
  assert.deepStrictEqual(expand('{1..2}{2..3}'), [
    '12', '13', '22', '23'
  ]);
});

test('numeric sequences with step count', function() {
  assert.deepStrictEqual(expand('{0..8..2}'), [
    '0', '2', '4', '6', '8'
  ]);
  assert.deepStrictEqual(expand('{1..8..2}'), [
    '1', '3', '5', '7'
  ]);
});

test('numeric sequence with negative x / y', function() {
  assert.deepStrictEqual(expand('{3..-2}'), [
    '3', '2', '1', '0', '-1', '-2'
  ]);
});

test('alphabetic sequences', function() {
  assert.deepStrictEqual(expand('1{a..b}2{b..c}3'), [
    '1a2b3', '1a2c3', '1b2b3', '1b2c3'
  ]);
  assert.deepStrictEqual(expand('{a..b}{b..c}'), [
    'ab', 'ac', 'bb', 'bc'
  ]);
});

test('alphabetic sequences with step count', function() {
  assert.deepStrictEqual(expand('{a..k..2}'), [
    'a', 'c', 'e', 'g', 'i', 'k'
  ]);
  assert.deepStrictEqual(expand('{b..k..2}'), [
    'b', 'd', 'f', 'h', 'j'
  ]);
});

