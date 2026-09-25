import test from 'node:test'
import assert from 'assert'
import expand from '../index.js'

// `parseCommaParts` recursed on the remainder of the string once per brace
// group, so chaining groups inside a brace set exhausted the native stack at
// ~7,000 groups (~29KB of input) - the parsing-side counterpart to the
// `expand` overflow fixed for CVE-2026-14257. The identical chain *outside* a
// brace set (`'{a,b}'.repeat(n)`) was already safe; routing it through
// `parseCommaParts` was not.
test('deeply chained comma groups do not overflow the stack', async t => {
  const str = '{' + '{a},'.repeat(50000) + 'b}'
  assert.doesNotThrow(() => {
    const expanded = expand(str)
    assert.ok(expanded.length > 0, 'still returns a result')
  })

  // The overflow happened while parsing, before anything was expanded, so
  // neither bound could prevent it - and neither is what keeps it safe now.
  assert.doesNotThrow(
    () => expand(str, { max: 1, maxLength: 1 }),
    'still safe with both bounds set as low as they go'
  )
})

// `push.apply(target, items)` passes one argument per element, so a single
// large array overflowed the stack with no recursion at all - this input
// reaches a recursion depth of exactly one.
test('a large comma set does not overflow the stack', async t => {
  const str = '{{x},' + 'a,'.repeat(200000) + 'b}'
  assert.doesNotThrow(() => {
    const expanded = expand(str)
    assert.ok(expanded.length > 0, 'still returns a (truncated) result')
  })
})

// The rewrite must not change what the parser produces.
test('nested comma groups still parse as before', async t => {
  assert.deepStrictEqual(expand('{a,b}{c,d}'), ['ac', 'ad', 'bc', 'bd'])
  assert.deepStrictEqual(expand('x{{a,b}}y'), ['x{a}y', 'x{b}y'])
  assert.deepStrictEqual(expand('{a,{b,c},d}'), ['a', 'b', 'c', 'd'])
  assert.deepStrictEqual(expand('{a,{b,c}d,e}'), ['a', 'bd', 'cd', 'e'])
  assert.deepStrictEqual(expand('x{a,{b,c},d}y'), [
    'xay',
    'xby',
    'xcy',
    'xdy',
  ])
  assert.deepStrictEqual(expand('{a,,b}'), ['a', 'b'])
  assert.deepStrictEqual(expand('{,}'), [])
  assert.deepStrictEqual(expand('{}'), ['{}'])
  assert.deepStrictEqual(expand('{a,b'), ['{a,b'])
})
