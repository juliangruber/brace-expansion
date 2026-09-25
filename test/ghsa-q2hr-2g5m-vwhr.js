import test from 'node:test'
import assert from 'assert'
import expand from '../index.js'

// Bash keeps a quirk where a brace group followed by a comma set still expands
// (`{a},b}`). The parser rewrites the string and restarts the scan, absorbing
// one `}` per pass, so `n` trailing braces cost `n` passes over a string that
// itself grows by one `escClose` sentinel each time - quadratic in `n`. 128KB
// of this shape blocked the event loop for 27 seconds to produce 2 results.
test('the {a},b} rewrite does not run in quadratic time', async t => {
  const build = n => '{a}' + '}'.repeat(n) + ',z}'

  const startTime = performance.now()
  expand(build(128000))
  const elapsed = performance.now() - startTime
  assert.ok(
    elapsed < 2000,
    `Expected time (${elapsed}ms) to be less than 2000ms`
  )

  // Neither output bound applies: the payload yields a couple of results at any
  // size, so the cost is all in parsing.
  assert.doesNotThrow(() =>
    expand(build(128000), { max: 1, maxLength: 1 })
  )
})

test('maxRewrites option bounds the rescan count', async t => {
  const build = n => '{a}' + '}'.repeat(n) + ',z}'

  // Real `{a},b}` input needs a handful of passes, and is untouched.
  assert.deepStrictEqual(expand('{a},b}'), ['a}', 'b'])
  assert.deepStrictEqual(expand('a{},b}c'), ['a}c', 'abc'])

  // Below the bound the result matches an unbounded expansion exactly.
  for (const n of [1, 10, 100]) {
    assert.deepStrictEqual(
      expand(build(n), { maxRewrites: 1000 }),
      expand(build(n), { maxRewrites: 100000 }),
      `${n} trailing braces are unchanged below the bound`
    )
  }

  // Past it the scan stops restarting and the rest stays literal, rather than
  // throwing - the same way `max` and `maxLength` truncate.
  assert.deepStrictEqual(expand('{a},b}', { maxRewrites: 0 }), ['{a},b}'])
  assert.ok(
    expand(build(50), { maxRewrites: 10 })[0].startsWith('{a}'),
    'past the bound the group comes back literal'
  )
})
