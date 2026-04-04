var test = require('tape');
var expand = require('..');

test('numeric sequences', function(t) {
  t.deepEqual(expand('a{1..2}b{2..3}c'), [
    'a1b2c', 'a1b3c', 'a2b2c', 'a2b3c'
  ]);
  t.deepEqual(expand('{1..2}{2..3}'), [
    '12', '13', '22', '23'
  ]);
  t.end();
});

test('numeric sequences with step count', function(t) {
  t.deepEqual(expand('{0..8..2}'), [
    '0', '2', '4', '6', '8'
  ]);
  t.deepEqual(expand('{1..8..2}'), [
    '1', '3', '5', '7'
  ]);
  t.end();
});

test('numeric sequence with negative x / y', function(t) {
  t.deepEqual(expand('{3..-2}'), [
    '3', '2', '1', '0', '-1', '-2'
  ]);
  t.end();
});

test('alphabetic sequences', function(t) {
  t.deepEqual(expand('1{a..b}2{b..c}3'), [
    '1a2b3', '1a2c3', '1b2b3', '1b2c3'
  ]);
  t.deepEqual(expand('{a..b}{b..c}'), [
    'ab', 'ac', 'bb', 'bc'
  ]);
  t.end();
});

test('alphabetic sequences with step count', function(t) {
  t.deepEqual(expand('{a..k..2}'), [
    'a', 'c', 'e', 'g', 'i', 'k'
  ]);
  t.deepEqual(expand('{b..k..2}'), [
    'b', 'd', 'f', 'h', 'j'
  ]);
  t.end();
});

test('sequence dos', function(t) {
  var str = '{1..10}'.repeat(10);
  var expanded10 = expand(str, { max: 10 });

  t.deepEqual(expanded10, [
    '1111111111',
    '1111111112',
    '1111111113',
    '1111111114',
    '1111111115',
    '1111111116',
    '1111111117',
    '1111111118',
    '1111111119',
    '11111111110'
  ], 'custom max truncates expansion');
  t.equal(expanded10.length, 10, 'custom max is respected');

  var large = '{1..11}'.repeat(5);
  t.equal(expand(large).length, 161051, 'default is unbounded');
  t.end();
});
