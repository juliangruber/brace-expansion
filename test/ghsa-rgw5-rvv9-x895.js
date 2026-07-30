import test from 'node:test'
import assert from 'assert'
import expand from '../index.js'

// Bypass of CVE-2026-14257's mitigation: each comma-separated alternative
// (`{alt,alt,...}`) is expanded independently, and `maxLength` only bounded
// each alternative's own output, not the running total accumulated across
// all of them. Many alternatives - each individually far under `maxLength` -
// could still sum to an unbounded intermediate array before the final
// `combine` call ever got a chance to truncate.
test('total length across comma alternatives is bounded', async t => {
  const alt = '{1..5}'
  const str = '{' + Array(1000).fill(alt).join(',') + '}'
  const startTime = performance.now()
  const expanded = expand(str, { maxLength: 50 })
  const endTime = performance.now()

  const totalLength = expanded.reduce((sum, s) => sum + s.length, 0)
  assert.ok(
    totalLength <= 50,
    `Expected total length (${totalLength}) to respect maxLength`,
  )
  assert.ok(expanded.length > 0, 'still returns a (truncated) result')
  assert.ok(
    endTime - startTime < 500,
    `Expected time (${endTime - startTime}ms) to be less than 500ms`,
  )

  // Regression case from the report: 400 alternatives, each individually
  // bounded by maxLength but unbounded in aggregate before the fix.
  const part = '{' + '0'.repeat(50) + '1..100000}'
  const bigStr = '{' + Array(400).fill(part).join(',') + '}'
  assert.doesNotThrow(() => {
    const bigExpanded = expand(bigStr)
    const bigTotal = bigExpanded.reduce((sum, s) => sum + s.length, 0)
    assert.ok(
      bigTotal <= 4_000_000,
      `Expected total length (${bigTotal}) to stay bounded`,
    )
  })
})

// A padded sequence's element width follows the input, so generating all `max`
// elements before `combine` could discard them cost time proportional to
// `max * width` - a ~400KB input blocked the event loop for over two minutes.
test('padded sequences respect maxLength while generating', async t => {
  const str = '{' + '0'.repeat(400_000) + '1..100000}'
  const startTime = performance.now()
  const expanded = expand(str)
  const elapsed = performance.now() - startTime

  const totalLength = expanded.reduce((sum, s) => sum + s.length, 0)
  assert.ok(
    totalLength <= 4_000_000,
    `Expected total length (${totalLength}) to stay bounded`,
  )
  assert.ok(expanded.length > 0, 'still returns a (truncated) result')
  assert.ok(
    elapsed < 2000,
    `Expected time (${elapsed}ms) to be less than 2000ms`,
  )

  // Truncating early must not change results that fit within the bound.
  assert.deepStrictEqual(
    expand('{01..10}'),
    ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'],
    'padded sequences under the bound are unaffected',
  )
})

// Bounding the intermediate `values` array must not change what `max` counts:
// alternatives that expand to nothing are dropped by `combine`, so they cost a
// slot in `values` but never a result.
test('max bounds the number of kept results', async t => {
  assert.deepStrictEqual(
    expand('{a,,b}', { max: 2 }),
    ['a', 'b'],
    'dropped empty alternatives do not count against max',
  )
  assert.deepStrictEqual(
    expand('{a,,,b,c}', { max: 3 }),
    ['a', 'b', 'c'],
    'consecutive empty alternatives do not count against max',
  )
  // Here the empties survive as `xy`, so they are results and do count.
  assert.deepStrictEqual(
    expand('x{a,,b}y', { max: 2 }),
    ['xay', 'xy'],
    'kept empty alternatives still count against max',
  )
})
