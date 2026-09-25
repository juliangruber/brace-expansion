var test = require('tape')
var expand = require('..')

// `expand` recurses once per level of brace *nesting*: once per comma member of
// a set, and once when re-wrapping a set whose body is a single part. The
// CVE-2026-14257 fix made the *tail* iterative (one level per chained group),
// so chained input was already safe - nesting drives a different recursion that
// the tail fix never touched.
test('deep nesting does not overflow the stack', function (t) {
  // A set nested inside every comma member. Crashed at ~3,900 levels (~15.6KB).
  var members = '{a,'.repeat(10000) + 'z' + '}'.repeat(10000)
  t.doesNotThrow(function () {
    t.ok(expand(members).length > 0, 'comma members still return a result')
  })

  // A set whose body parses to a single part, nested all the way down. The
  // cheapest payload: crashed at ~3,100 levels, about 6KB of input.
  var single = '{'.repeat(10000) + 'a,b' + '}'.repeat(10000)
  t.doesNotThrow(function () {
    t.ok(expand(single).length > 0, 'single set still returns a result')
  })

  // Neither output bound could prevent this - the payloads expand to almost
  // nothing, so the result set never reaches either limit.
  t.doesNotThrow(function () {
    expand(single, { max: 1, maxLength: 1 })
  }, 'still safe with both output bounds at their lowest')

  t.end()
})

test('maxDepth option bounds nesting depth', function (t) {
  // The bound counts levels of nesting followed, so a flat set never needs any:
  // its members are literals, and expanding them is what would recurse.
  t.deepEqual(expand('{a,b}', { maxDepth: 0 }), ['a', 'b'])

  // Below the bound the result is exactly what an unbounded expansion produces.
  var cases = [
    '{a,b}',
    '{{a,b}}',
    '{{{a,b}}}',
    '{a,{b,c}}',
    '{a,{b,{c,d}}}',
    'x{{a,b}}y',
  ]
  for (var i = 0; i < cases.length; i++) {
    t.deepEqual(
      expand(cases[i], { maxDepth: 50 }),
      expand(cases[i]),
      cases[i] + ' is unchanged below the bound'
    )
  }

  // Past it, the group stops expanding and comes back literal rather than
  // throwing - the same way a group that cannot expand is already handled.
  t.deepEqual(expand('{{a,b}}', { maxDepth: 0 }), ['{{a,b}}'])
  t.deepEqual(expand('{{{a,b}}}', { maxDepth: 1 }), ['{{{a,b}}}'])
  t.deepEqual(expand('x{{a,b}}y', { maxDepth: 0 }), ['x{{a,b}}y'])

  // Partially: the levels within the bound still expand.
  t.deepEqual(expand('{a,{b,c}}', { maxDepth: 0 }), ['a', '{b,c}'])
  t.deepEqual(expand('{a,{b,{c,d}}}', { maxDepth: 1 }), [
    'a',
    'b',
    '{c,d}',
  ])

  t.end()
})
