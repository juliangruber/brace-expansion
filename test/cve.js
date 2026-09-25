/* eslint-disable no-template-curly-in-string */

import test from 'node:test'
import assert from 'assert'
import expand, { EXPANSION_MAX_LENGTH } from '../index.js'

// CVE-2026-14257: `max` caps the number of results but not their length, so
// chaining many brace groups keeps the count under `max` while each result
// grows with the number of groups. Building 100k long results (and the
// intermediate arrays combined along the way) exhausted memory and crashed
// the process with an uncatchable out-of-memory error.
test('total expansion length is bounded', function () {
  const str = '{a,b}'.repeat(1500)
  const startTime = performance.now()
  const expanded = expand(str)
  const endTime = performance.now()

  const totalLength = expanded.reduce((sum, s) => sum + s.length, 0)
  assert.ok(
    totalLength <= EXPANSION_MAX_LENGTH,
    `Expected total length (${totalLength}) to be bounded`
  )
  assert.ok(expanded.length > 0, 'still returns a (truncated) result')
  assert.ok(
    expanded.every(s => /^[ab]+$/.test(s)),
    'results are valid expansions'
  )
  assert.ok(
    endTime - startTime < 5000,
    `Expected time (${endTime - startTime}ms) to be less than 5000ms`
  )

  // The bound is a single accumulator, not a per-level limit, so it holds no
  // matter how many brace groups are chained - not `groups * maxLength`.
  for (const groups of [100, 1500, 5000]) {
    const total = expand('{a,b}'.repeat(groups)).reduce(
      (sum, s) => sum + s.length,
      0
    )
    assert.ok(
      total <= EXPANSION_MAX_LENGTH,
      `Expected total length (${total}) to stay bounded at ${groups} groups`
    )
  }
})

// Expanding the tail iteratively (rather than recursing once per brace group)
// keeps native stack depth constant, so deeply chained input that used to throw
// `RangeError: Maximum call stack size exceeded` around ~2,700 groups now
// returns a bounded result.
test('deep chaining does not overflow the stack', function () {
  const str = '{a,b}'.repeat(50_000)
  assert.doesNotThrow(() => {
    const expanded = expand(str)
    assert.ok(expanded.length > 0, 'still returns a (truncated) result')
    assert.ok(
      expanded.reduce((sum, s) => sum + s.length, 0) <=
        EXPANSION_MAX_LENGTH,
      'output stays bounded'
    )
  })
})

test('maxLength option bounds output size', function () {
  const str = '{a,b}'.repeat(1500)
  const expanded = expand(str, { maxLength: 100_000 })
  const totalLength = expanded.reduce((sum, s) => sum + s.length, 0)
  assert.ok(
    totalLength <= 100_000,
    `Expected total length (${totalLength}) to respect maxLength`
  )

  // The `${...}` literal branch combines its body with the expanded tail and
  // must be bounded the same way.
  const dollar = '${x}' + '{a,b}'.repeat(20)
  const expandedDollar = expand(dollar, { maxLength: 100_000 })
  const dollarLength = expandedDollar.reduce((sum, s) => sum + s.length, 0)
  assert.ok(
    dollarLength <= 100_000,
    `Expected total length (${dollarLength}) to respect maxLength`
  )
})

test('max option caps the number of results', function () {
  assert.deepStrictEqual(expand('{a,b,c,d,e}', { max: 2 }), ['a', 'b'])
})

// The iterative algorithm keeps `isTop` across the `{a},b}` rewrite, where
// published 3.0.2's `return expand(str)` dropped it - so empty comma-parts
// are now dropped after the rewrite. Bash agrees (`{a},}` expands to `a}`
// alone), and upstream 5.0.8 behaves identically. This is the only observable
// behavior change from 3.0.2; pin it so it stays deliberate.
test('empty results are dropped after the {a},b} rewrite', function () {
  assert.deepStrictEqual(expand('{a},}'), ['a}'])
  assert.deepStrictEqual(expand('{a},,b}'), ['a}', 'b'])
})
