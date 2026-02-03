import t from 'tap'
import { expand } from '../dist/esm/index.js'
import fs from 'fs'

t.test('bash-results', async t => {
  const resfile = new URL('./bash-results.txt', import.meta.url)
  const cases = fs
    .readFileSync(resfile, 'utf8')
    .replace(/\r\n/g, '\n')
    .split('><><><><')

  // throw away the EOF marker
  cases.pop()

  t.test('matches bash expansions', async t => {
    cases.forEach(testcase => {
      let set = testcase.split('\n')
      const pattern = set.shift()
      const actual = expand(pattern)

      // If it expands to the empty string, then it's actually
      // just nothing, but Bash is a singly typed language, so
      // "nothing" is the same as "".
      if (set.length === 1 && set[0] === '') {
        set = []
      } else {
        // otherwise, strip off the [] that were added so that
        // "" expansions would be preserved properly.
        set = set.map(function (s) {
          return s.replace(/^\[|\]$/g, '')
        })
      }

      t.strictSame(actual, set, pattern)
    })
  })
})

t.test('ignores ${', async t => {
  t.strictSame(expand('${1..3}'), ['${1..3}'])
  t.strictSame(expand('${a,b}${c,d}'), ['${a,b}${c,d}'])
  t.strictSame(expand('${a,b}${c,d}{e,f}'), [
    '${a,b}${c,d}e',
    '${a,b}${c,d}f',
  ])
  t.strictSame(expand('{a,b}${c,d}${e,f}'), [
    'a${c,d}${e,f}',
    'b${c,d}${e,f}',
  ])
  t.strictSame(expand('${a,b}${c,d}{1..3}'), [
    '${a,b}${c,d}1',
    '${a,b}${c,d}2',
    '${a,b}${c,d}3',
  ])
  t.strictSame(expand('x${a,b}x${c,d}x'), ['x${a,b}x${c,d}x'])
})

t.test('empty option', async t => {
  t.strictSame(expand('-v{,,,,}'), ['-v', '-v', '-v', '-v', '-v'])
})

t.test('negative increment', async t => {
  t.strictSame(expand('{3..1}'), ['3', '2', '1'])
  t.strictSame(expand('{10..8}'), ['10', '9', '8'])
  t.strictSame(expand('{10..08}'), ['10', '09', '08'])
  t.strictSame(expand('{c..a}'), ['c', 'b', 'a'])

  t.strictSame(expand('{4..0..2}'), ['4', '2', '0'])
  t.strictSame(expand('{4..0..-2}'), ['4', '2', '0'])
  t.strictSame(expand('{e..a..2}'), ['e', 'c', 'a'])
})

t.test('nested', async t => {
  t.strictSame(expand('{a,b{1..3},c}'), ['a', 'b1', 'b2', 'b3', 'c'])
  t.strictSame(
    expand('{{A..Z},{a..z}}'),
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split(''),
  )
  t.strictSame(expand('ppp{,config,oe{,conf}}'), [
    'ppp',
    'pppconfig',
    'pppoe',
    'pppoeconf',
  ])
})

t.test('order', async t => {
  t.strictSame(expand('a{d,c,b}e'), ['ade', 'ace', 'abe'])
})

t.test('pad', async t => {
  t.strictSame(expand('{9..11}'), ['9', '10', '11'])
  t.strictSame(expand('{09..11}'), ['09', '10', '11'])
})

t.test('redos', async t => {
  const str = '{a}' + ','.repeat(100000) + '\u0000'
  const startTime = performance.now()
  expand(str)
  const endTime = performance.now()
  const timeTaken = endTime - startTime
  t.ok(
    timeTaken < 1000,
    `Expected time (${timeTaken}ms) to be less than 1000ms`,
  )
})

t.test('x and y of same type', async t => {
  t.strictSame(expand('{a..9}'), ['{a..9}'])
})

t.test('numeric sequences', async t => {
  t.strictSame(expand('a{1..2}b{2..3}c'), [
    'a1b2c',
    'a1b3c',
    'a2b2c',
    'a2b3c',
  ])
  t.strictSame(expand('{1..2}{2..3}'), ['12', '13', '22', '23'])
})

t.test('numeric sequences with step count', async t => {
  t.strictSame(expand('{0..8..2}'), ['0', '2', '4', '6', '8'])
  t.strictSame(expand('{1..8..2}'), ['1', '3', '5', '7'])
})

t.test('numeric sequence with negative x / y', async t => {
  t.strictSame(expand('{3..-2}'), ['3', '2', '1', '0', '-1', '-2'])
})

t.test('alphabetic sequences', async t => {
  t.strictSame(expand('1{a..b}2{b..c}3'), [
    '1a2b3',
    '1a2c3',
    '1b2b3',
    '1b2c3',
  ])
  t.strictSame(expand('{a..b}{b..c}'), ['ab', 'ac', 'bb', 'bc'])
})

t.test('alphabetic sequences with step count', async t => {
  t.strictSame(expand('{a..k..2}'), ['a', 'c', 'e', 'g', 'i', 'k'])
  t.strictSame(expand('{b..k..2}'), ['b', 'd', 'f', 'h', 'j'])
})
