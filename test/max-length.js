var test = require('tape');
var expand = require('..');

// CVE-2026-14257: `max` caps the number of results but not their length, so
// chaining many brace groups keeps the count under `max` while each result
// grows with the number of groups. Building the long results (and the
// intermediate arrays combined along the way) exhausted memory and crashed
// the process with an uncatchable out-of-memory error.
test('total expansion length is bounded', function (t) {
  const str = '{a,b}'.repeat(1500)
  const startTime = performance.now()
  const expanded = expand(str)
  const endTime = performance.now()

  const totalLength = expanded.reduce((sum, s) => sum + s.length, 0)
  t.ok(totalLength <= 4000000, `expected total length (${totalLength}) to be bounded`)
  t.ok(expanded.length > 0, 'still returns a (truncated) result')
  t.ok(expanded.every(s => /^[ab]+$/.test(s)), 'results are valid expansions')
  t.ok(
    endTime - startTime < 5000,
    `expected time (${endTime - startTime}ms) to be less than 5000ms`
  )

  // The bound is a single accumulator, not a per-level limit, so it holds no
  // matter how many brace groups are chained - not `groups * maxLength`.
  for (const groups of [100, 1500]) {
    const total = expand('{a,b}'.repeat(groups)).reduce((sum, s) => sum + s.length, 0)
    t.ok(total <= 4000000, `expected total length (${total}) to stay bounded at ${groups} groups`)
  }
  t.end()
})

test('maxLength option bounds output size', function (t) {
  const str = '{a,b}'.repeat(1500)
  const expanded = expand(str, { maxLength: 100000 })
  const totalLength = expanded.reduce((sum, s) => sum + s.length, 0)
  t.ok(totalLength <= 100000, `expected total length (${totalLength}) to respect maxLength`)

  // The single-body branch (`x{{a,b}}y`) combines its body with the expanded
  // tail and must be bounded the same way.
  const single = '{{a,b}}' + '{a,b}'.repeat(20)
  const expandedSingle = expand(single, { maxLength: 1000 })
  const singleLength = expandedSingle.reduce((sum, s) => sum + s.length, 0)
  t.ok(singleLength <= 1000, `expected total length (${singleLength}) to respect maxLength`)
  t.end()
})
