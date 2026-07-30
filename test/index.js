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

// https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-3jxr-9vmj-r5cp
t.test('unbound recursion', async t => {
  // A run of non-expanding `{}` groups used to expand `post` once per group,
  // doubling the work on every group. This 30-group, 90 byte input blocked
  // for minutes.
  const str =
    'a{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}'
  const startTime = performance.now()
  const expanded = expand(str)
  const endTime = performance.now()
  const timeTaken = endTime - startTime
  t.strictSame(expanded, [str], 'does not expand')
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

// https://github.com/isaacs/brace-expansion/security/advisories/GHSA-7h2j-956f-4vf2
t.test('multiple sequences max', async t => {
  const str = '{1..10}'.repeat(10)
  const startTime = performance.now()
  const expanded = expand(str)
  t.equal(expanded.length, 100_000, 'expansion is limited')
  const expanded10 = expand(str, { max: 10 })
  t.strictSame(expanded10, [
    '1111111111',
    '1111111112',
    '1111111113',
    '1111111114',
    '1111111115',
    '1111111116',
    '1111111117',
    '1111111118',
    '1111111119',
    '11111111110',
  ])

  t.equal(expanded10.length, 10, 'expansion is limited')
  const endTime = performance.now()
  const timeTaken = endTime - startTime
  t.ok(
    timeTaken < 500,
    `Expected time (${timeTaken}ms) to be less than 500ms`,
  )
})

t.test('single sequence max', async t => {
  const str = '{1..100000000}'
  const startTime = performance.now()
  expand(str, { max: 10 })
  const endTime = performance.now()
  const timeTaken = endTime - startTime
  t.ok(
    timeTaken < 500,
    `Expected time (${timeTaken}ms) to be less than 500ms`,
  )
})

// CVE-2026-14257: `max` caps the number of results but not their length, so
// chaining many brace groups keeps the count under `max` while each result
// grows with the number of groups. Building 100k long results (and the
// intermediate arrays combined along the way) exhausted memory and crashed
// the process with an uncatchable out-of-memory error.
t.test('total expansion length is bounded', async t => {
  const str = '{a,b}'.repeat(1500)
  const startTime = performance.now()
  const expanded = expand(str)
  const endTime = performance.now()

  const totalLength = expanded.reduce((sum, s) => sum + s.length, 0)
  t.ok(
    totalLength <= 4_000_000,
    `Expected total length (${totalLength}) to be bounded`,
  )
  t.ok(expanded.length > 0, 'still returns a (truncated) result')
  t.ok(
    expanded.every(s => /^[ab]+$/.test(s)),
    'results are valid expansions',
  )
  t.ok(
    endTime - startTime < 5000,
    `Expected time (${endTime - startTime}ms) to be less than 5000ms`,
  )

  // The bound is a single accumulator, not a per-level limit, so it holds no
  // matter how many brace groups are chained - not `groups * maxLength`.
  for (const groups of [100, 1500, 5000]) {
    const total = expand('{a,b}'.repeat(groups)).reduce(
      (sum, s) => sum + s.length,
      0,
    )
    t.ok(
      total <= 4_000_000,
      `Expected total length (${total}) to stay bounded at ${groups} groups`,
    )
  }
})

// Expanding the tail iteratively (rather than recursing once per brace group)
// keeps native stack depth constant, so deeply chained input that used to throw
// `RangeError: Maximum call stack size exceeded` around ~2,700 groups now
// returns a bounded result.
t.test('deep chaining does not overflow the stack', async t => {
  const str = '{a,b}'.repeat(50_000)
  t.doesNotThrow(() => {
    const expanded = expand(str)
    t.ok(expanded.length > 0, 'still returns a (truncated) result')
    t.ok(
      expanded.reduce((sum, s) => sum + s.length, 0) <= 4_000_000,
      'output stays bounded',
    )
  })
})

t.test('maxLength option bounds output size', async t => {
  const str = '{a,b}'.repeat(1500)
  const expanded = expand(str, { maxLength: 100_000 })
  const totalLength = expanded.reduce((sum, s) => sum + s.length, 0)
  t.ok(
    totalLength <= 100_000,
    `Expected total length (${totalLength}) to respect maxLength`,
  )

  // The `${...}` literal branch combines its body with the expanded tail and
  // must be bounded the same way.
  const dollar = '${x}' + '{a,b}'.repeat(20)
  const expandedDollar = expand(dollar, { maxLength: 100_000 })
  const dollarLength = expandedDollar.reduce((sum, s) => sum + s.length, 0)
  t.ok(
    dollarLength <= 100_000,
    `Expected total length (${dollarLength}) to respect maxLength`,
  )
})

// Bypass of CVE-2026-14257's mitigation: each comma-separated alternative
// (`{alt,alt,...}`) is expanded independently, and `maxLength` only bounded
// each alternative's own output, not the running total accumulated across
// all of them. Many alternatives - each individually far under `maxLength` -
// could still sum to an unbounded intermediate array before the final
// `combine` call ever got a chance to truncate.
t.test('total length across comma alternatives is bounded', async t => {
  const alt = '{1..5}'
  const str = '{' + Array(1000).fill(alt).join(',') + '}'
  const startTime = performance.now()
  const expanded = expand(str, { maxLength: 50 })
  const endTime = performance.now()

  const totalLength = expanded.reduce((sum, s) => sum + s.length, 0)
  t.ok(
    totalLength <= 50,
    `Expected total length (${totalLength}) to respect maxLength`,
  )
  t.ok(expanded.length > 0, 'still returns a (truncated) result')
  t.ok(
    endTime - startTime < 500,
    `Expected time (${endTime - startTime}ms) to be less than 500ms`,
  )

  // Regression case from the report: 400 alternatives, each individually
  // bounded by maxLength but unbounded in aggregate before the fix.
  const part = '{' + '0'.repeat(50) + '1..100000}'
  const bigStr = '{' + Array(400).fill(part).join(',') + '}'
  t.doesNotThrow(() => {
    const bigExpanded = expand(bigStr)
    const bigTotal = bigExpanded.reduce((sum, s) => sum + s.length, 0)
    t.ok(
      bigTotal <= 4_000_000,
      `Expected total length (${bigTotal}) to stay bounded`,
    )
  })
})

// A padded sequence's element width follows the input, so generating all `max`
// elements before `combine` could discard them cost time proportional to
// `max * width` - a ~400KB input blocked the event loop for over two minutes.
t.test('padded sequences respect maxLength while generating', async t => {
  const str = '{' + '0'.repeat(400_000) + '1..100000}'
  const startTime = performance.now()
  const expanded = expand(str)
  const elapsed = performance.now() - startTime

  const totalLength = expanded.reduce((sum, s) => sum + s.length, 0)
  t.ok(
    totalLength <= 4_000_000,
    `Expected total length (${totalLength}) to stay bounded`,
  )
  t.ok(expanded.length > 0, 'still returns a (truncated) result')
  t.ok(
    elapsed < 2000,
    `Expected time (${elapsed}ms) to be less than 2000ms`,
  )

  // Truncating early must not change results that fit within the bound.
  t.same(
    expand('{01..10}'),
    ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'],
    'padded sequences under the bound are unaffected',
  )
})

// Bounding the intermediate `values` array must not change what `max` counts:
// alternatives that expand to nothing are dropped by `combine`, so they cost a
// slot in `values` but never a result.
t.test('max bounds the number of kept results', async t => {
  t.same(
    expand('{a,,b}', { max: 2 }),
    ['a', 'b'],
    'dropped empty alternatives do not count against max',
  )
  t.same(
    expand('{a,,,b,c}', { max: 3 }),
    ['a', 'b', 'c'],
    'consecutive empty alternatives do not count against max',
  )
  // Here the empties survive as `xy`, so they are results and do count.
  t.same(
    expand('x{a,,b}y', { max: 2 }),
    ['xay', 'xy'],
    'kept empty alternatives still count against max',
  )
})

// Empty alternatives are normally skipped before they reach `combine`, but that
// pre-filter only applies when every accumulated prefix is still empty. Once a
// preceding group has contributed a non-empty prefix, `combine` is the only
// thing left to drop the empties that pairing the empty prefixes produces.
t.test(
  'empties are dropped when only some prefixes are empty',
  async t => {
    t.same(
      expand('{a,}{,}'),
      ['a', 'a'],
      'trailing empty group after a mixed one',
    )
    t.same(
      expand('{,a}{,}'),
      ['a', 'a'],
      'order of the alternatives is irrelevant',
    )
    t.same(
      expand('{a,}{,}{,}'),
      ['a', 'a', 'a', 'a'],
      'still dropped across several trailing empty groups',
    )
  },
)
