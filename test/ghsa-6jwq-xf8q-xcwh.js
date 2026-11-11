import test from 'node:test'
import assert from 'assert'
import expand from '../index.js'

// `maxDepth` bounds how many levels of nesting are followed, but each level
// still handed `balanced` - in `expand` and again in `parseCommaParts` - a
// string only two characters shorter than its parent's, so every level paid
// for the whole input again. 100KB of this shape blocked the event loop for
// 4.5 seconds to produce a single result.
test('rescanning nested sets is bounded', async t => {
  const build = n => '{'.repeat(n) + 'a,b' + '}'.repeat(n)

  // About 400KB. The budget caps the characters scanned rather than the input,
  // so this costs no more than the smallest payload that exhausts it.
  const startTime = performance.now()
  const expanded = expand(build(200000))
  const elapsed = performance.now() - startTime
  assert.deepStrictEqual(
    expanded,
    [build(200000)],
    'past the budget the input comes back literal'
  )
  assert.ok(
    elapsed < 5000,
    `Expected time (${elapsed}ms) to be less than 5000ms`
  )

  // Neither output bound applies: the payload yields a single result at any
  // size, so the cost is all in parsing.
  assert.doesNotThrow(() =>
    expand(build(200000), { max: 1, maxLength: 1 })
  )
})

// When the innermost set expands to several results, the level above wraps
// each one in braces and scans it again, and so does every level after that.
// 484 bytes of this shape took 13 seconds to produce 9,708 results, and 2KB
// nested to `maxDepth` over a minute.
test('rescanning the results of nested sets is bounded', async t => {
  const nest = (n, inner) => '{'.repeat(n) + inner + '}'.repeat(n)
  for (const str of [
    nest(200, '{a,b,c}'.repeat(12)),
    nest(1000, '{a,b,c,d,e,f,g,h,i,j}'.repeat(5)),
    nest(1000, '{,,,,,,,,,}'.repeat(5)),
  ]) {
    // Once the budget is spent, every level above would still wrap each
    // result and try to expand it again - `maxDepth` times the result count,
    // none of it charged to the budget. The set stays literal instead.
    assert.deepStrictEqual(
      expand(str),
      [str],
      'past the budget the input comes back literal'
    )
  }
})

// Each scan is charged for the characters `balanced` walks - up to the closing
// `}` of the group it finds - not for the whole string it is handed, or a set
// with many groups would pay for its tail again at every one. A list at
// minimatch's 64KB pattern length cap needs about 432K steps.
test('a long list of sets expands in full', async t => {
  const str =
    '{' +
    Array.from({ length: 3920 }, (_, i) => `pkg${i}/{a,b}.js`).join(',') +
    '}'
  assert.ok(str.length <= 64 * 1024, 'fits under the cap')
  const expanded = expand(str)
  assert.strictEqual(expanded.length, 7840, 'every member expands')
  assert.strictEqual(expanded[0], 'pkg0/a.js')
  assert.strictEqual(expanded[7839], 'pkg3919/b.js')
})

// Sequence values were never charged, and each group in a chain generated up
// to `max` of them however few combining could keep: 64KB of this blocked the
// event loop for 9 seconds and returned 610 results. Now the budget runs out a
// few groups in, and every result so far carries the rest of the chain
// literally, so `maxLength` leaves room for 62 of them.
test('generating sequence values is bounded', async t => {
  const str = '{1..99999}'.repeat(6553)
  const expanded = expand(str)
  assert.strictEqual(expanded.length, 62, 'the budget runs out partway')
  assert.ok(
    expanded.every(s => s.endsWith('{1..99999}')),
    'and the rest comes back literal'
  )
})

// A zero-padded value is built out to the width of the sequence's ends, which
// the input sets, but was charged one step like any other: 64KB of this took
// 7 seconds and returned 66 results. Each one costs a step per character now.
test('padded sequence values cost their width', async t => {
  const str = ('{' + '0'.repeat(100) + '..99999}').repeat(595)
  const expanded = expand(str)
  assert.strictEqual(expanded.length, 61, 'the budget runs out partway')
  assert.ok(
    expanded.every(s => s.endsWith('..99999}')),
    'and the rest comes back literal'
  )
  assert.strictEqual(
    expand('{00001..100000}').length,
    100000,
    'a real one expands'
  )
})

// `max` and `maxLength` bound what one brace group builds, not how many groups
// build it. Results this short never reach `maxLength`, so every group in the
// chain rebuilt 100k of them: 52KB of the first blocked the event loop for 11
// seconds to return 100,000 results, and 64KB of the second for 14 to return
// none. Now the budget runs out partway, and `maxLength` leaves room for a few
// dozen results carrying the rest of the chain.
test('building results across chained groups is bounded', async t => {
  assert.strictEqual(expand('{,a}'.repeat(13107)).length, 77)
  assert.strictEqual(expand('{,}'.repeat(21845)).length, 61)
})

// The sets inside build 100k empty results between them, which the set around
// them wraps and expands again one at a time. Each of those calls scans and
// builds next to nothing, so 64KB of this made 4M of them and returned 106
// results. Each call costs 16 steps of its own now.
test('expanding many short strings is bounded', async t => {
  const set = '{' + ','.repeat(316) + '}'
  const str = ('{' + set + set + '}').repeat(100)
  assert.strictEqual(expand(str).length, 68)
})

// Bash drops empty results at the top level, and `combine` skipped them before
// checking `max` so they would not count against it - which left nothing to
// stop it visiting every pair of `acc` and `values` while keeping almost none.
// 64KB of this took 2 seconds. The empties are now skipped without being
// visited, so the result is the same and costs what it keeps.
test('dropping empty results is not quadratic', async t => {
  const str = '{' + ','.repeat(32000) + 'x}{' + ','.repeat(32000) + '}'
  const startTime = performance.now()
  const expanded = expand(str)
  const elapsed = performance.now() - startTime
  assert.strictEqual(expanded.length, 32001, 'every result is kept')
  assert.ok(
    expanded.every(s => s === 'x'),
    'and only the empties are dropped'
  )
  assert.ok(
    elapsed < 1000,
    `Expected time (${elapsed}ms) to be less than 1000ms`
  )
})

// The `{a},b}` rewrite checked what follows the group with `/,(?!,).*\}/`,
// which backtracks through the rest of the line from every `,` - quadratic in
// that length - and checked it again on every pass. 7KB of this blocked the
// event loop for 10 seconds. The check is now one pass from the end.
test('the {a},b} check does not run in quadratic time', async t => {
  const str = '{a}' + '}'.repeat(1000) + ',a'.repeat(3000) + '\n,}'
  const startTime = performance.now()
  const expanded = expand(str)
  const elapsed = performance.now() - startTime
  assert.deepStrictEqual(expanded, [str], 'the result is unchanged')
  assert.ok(
    elapsed < 1000,
    `Expected time (${elapsed}ms) to be less than 1000ms`
  )

  // It asks exactly what the regex did: a `,` not followed by another `,`,
  // with a `}` after it on the same line. `.` does not match line terminators,
  // so none of them may come between the two.
  assert.deepStrictEqual(expand('{a},b}'), ['a}', 'b'])
  assert.deepStrictEqual(expand('{a},}'), ['a}'])
  assert.deepStrictEqual(expand('{a},,b}'), ['a}', 'b'])
  assert.deepStrictEqual(expand('{a},\n,b}'), ['a}', '\n', 'b'])
  assert.deepStrictEqual(expand('{a},b}\n'), ['a}\n', 'b\n'])
  for (const eol of ['\n', '\r', '\u2028', '\u2029']) {
    assert.deepStrictEqual(
      expand('{a},b' + eol + '}'),
      ['{a},b' + eol + '}'],
      `U+${eol.charCodeAt(0).toString(16).padStart(4, '0')} ends the line`
    )
  }

  // With no `}` after the commas the regex backtracked through the rest of
  // the line from every one of them, even without a rewrite to repeat it:
  // 256KB of this took 33 seconds.
  const commas = '{a}' + ',a'.repeat(131_072)
  const commasStart = performance.now()
  assert.deepStrictEqual(
    expand(commas),
    [commas],
    'a comma run stays literal'
  )
  const commasElapsed = performance.now() - commasStart
  assert.ok(
    commasElapsed < 1000,
    `Expected time (${commasElapsed}ms) to be less than 1000ms`
  )
})

// `balanced` only learns that a `{` is unmatched by reading to the end of the
// string, so with one at the head of every group each scan read the rest of
// the input: 256KB of `'{a,{b,c}'.repeat(n)` took 25 seconds, and once the
// step budget charged for it, 64KB ran out partway through and came back half
// literal. The unmatched `{` are masked once they are found, so these now
// expand in full, well inside the budget.
test('unmatched braces ahead of every group are read once', async t => {
  for (const unit of ['{a,{b,c}', '{{a,b}', '{{1..2}']) {
    const str = unit.repeat(Math.ceil(262_144 / unit.length))
    const startTime = performance.now()
    const expanded = expand(str)
    const elapsed = performance.now() - startTime
    assert.ok(
      elapsed < 2000,
      `${unit}: expected time (${elapsed}ms) to be less than 2000ms`
    )
    assert.deepStrictEqual(
      expanded,
      expand(str, { maxSteps: Infinity }),
      `${unit}: the step budget does not run out`
    )
  }

  // The unmatched `{` stay literal, as in Bash.
  assert.deepStrictEqual(expand('{a,{b,c}'), ['{a,b', '{a,c'])
  assert.deepStrictEqual(expand('{{a,b}'), ['{a', '{b'])
  assert.deepStrictEqual(expand('{{a,b}{{c,d}'), [
    '{a{c',
    '{a{d',
    '{b{c',
    '{b{d',
  ])
  // The `{a},b}` rewrite can leave the `{` it rewrote without a `}`.
  assert.deepStrictEqual(expand('{a},{b}'), ['{a},{b}'])
  assert.deepStrictEqual(expand('{a},{b,c}'), ['{a},b', '{a},c'])
  assert.deepStrictEqual(expand('{x{a},{b,c}'), ['{x{a},b', '{x{a},c'])
  assert.deepStrictEqual(expand('x{a},{b{c,d}'), ['x{a},{bc', 'x{a},{bd'])
})

// Escaped characters are swapped for placeholders while parsing, and the step
// budget charges for the characters it reads, placeholders included. They used
// to carry `Math.random()` as is, whose length varies, so input needing close
// to the default budget expanded in some processes and came back literal in
// others. They are a fixed length now, and this needs exactly 19,808,000 steps
// in every process.
test('escaped input costs the same in every process', async t => {
  const str =
    '{'.repeat(1000) + 'a,b' + '\\,'.repeat(210) + '}'.repeat(1000)
  assert.strictEqual(expand(str).length, 2, 'it fits in the default')
  assert.strictEqual(expand(str, { maxSteps: 19808000 }).length, 2)
  // Literal, but unescaped as always.
  assert.deepStrictEqual(
    expand(str, { maxSteps: 19807999 }),
    [str.split('\\,').join(',')],
    'and one step less leaves it literal'
  )
})

test('maxSteps option bounds the work done', async t => {
  // Real patterns need a few hundred steps at most. Below the bound the result
  // is exactly what an unbounded expansion produces.
  for (const str of [
    '{a,b}',
    '{{a,b}}',
    '{a,{b,{c,d}}}',
    'a{b,c}d{e,f}',
    'x{{a,b}}y',
    '{a},b}',
    '{{a,b}',
    '${a,b}{c,d}',
    '{1..3}{a..c}',
    'src/**/*.{js,ts,jsx,tsx}',
    '{src,lib}/{a,b}/{c,d}/**/*.{js,ts}',
  ]) {
    assert.deepStrictEqual(
      expand(str, { maxSteps: 1000 }),
      expand(str, { maxSteps: Infinity }),
      `${str} is unchanged below the bound`
    )
  }

  // The default leaves room for the deepest nesting `maxDepth` follows, which
  // takes about 4M steps.
  const deepest = '{'.repeat(1000) + 'a,b' + '}'.repeat(1000)
  assert.deepStrictEqual(
    expand(deepest),
    expand(deepest, { maxSteps: Infinity }),
    'nesting to maxDepth is unchanged by the default'
  )
  // Input that already hits `maxLength` in every group can run out, though:
  // this needs about 22M steps, and stops at 316 of the 800 results `maxLength`
  // leaves room for.
  assert.strictEqual(expand('{a,b}'.repeat(5000)).length, 316)

  // Past it, what is left stops expanding and comes back literal rather than
  // throwing - the same way `maxDepth` and `maxRewrites` truncate.
  assert.deepStrictEqual(expand('{a,b}', { maxSteps: 0 }), ['{a,b}'])
  assert.deepStrictEqual(expand('{a},b}', { maxSteps: 0 }), ['{a},b}'])
  assert.deepStrictEqual(expand('x{{a,b}}y', { maxSteps: 0 }), [
    'x{{a,b}}y',
  ])

  // A scan costs the characters up to the closing `}` of the group it finds,
  // or the whole string when there is none, and each result built costs one.
  // Expanding a string - the pattern, or a member of a set - costs 16 more.
  // `{a,b}` takes 16 to start, 5 to find the set and 3 to split its body, 18
  // for each member - 16 to start, 1 to scan it and 1 for its result - and 2
  // for the set's results.
  assert.deepStrictEqual(expand('{a,b}', { maxSteps: 62 }), ['a', 'b'])
  assert.deepStrictEqual(expand('{a,b}', { maxSteps: 61 }), ['{a,b}'])
  // At 21 the set is found, but there is nothing left to split its body with.
  assert.deepStrictEqual(expand('{a,b}', { maxSteps: 21 }), ['{a,b}'])

  // Each value a sequence generates costs one too: `{1..3}` takes 16 to start,
  // 6 to find the set, 3 for its values and 3 for its results.
  assert.deepStrictEqual(expand('{1..3}', { maxSteps: 28 }), [
    '1',
    '2',
    '3',
  ])
  assert.deepStrictEqual(expand('{1..3}', { maxSteps: 27 }), ['{1..3}'])
  // A zero-padded value costs one per character, so `{01..03}` takes 6 for
  // its values.
  assert.deepStrictEqual(expand('{01..03}', { maxSteps: 33 }), [
    '01',
    '02',
    '03',
  ])
  assert.deepStrictEqual(expand('{01..03}', { maxSteps: 32 }), [
    '{01..03}',
  ])

  // An unmatched `{` ahead of the set sends the search on to the end of the
  // string, and masking it so that later searches stop sooner reads it once
  // more, so `{{a,b}c` takes 7 to find the set rather than 6, and 7 to mask
  // it.
  assert.deepStrictEqual(expand('{{a,b}c', { maxSteps: 71 }), [
    '{ac',
    '{bc',
  ])
  assert.deepStrictEqual(expand('{{a,b}c', { maxSteps: 70 }), ['{{a,b}c'])

  // The `{a},b}` check costs what follows the group, and the restart scans the
  // rewritten string, which holds an escape placeholder 25 characters long.
  // `{a},b}` takes 16 to start, 3 to find `{a}` and 3 to check `,b}`, 30 to
  // find the set in the rewritten string and 28 to split its body, 43 and 18
  // for its members, and 2 for its results.
  assert.deepStrictEqual(expand('{a},b}', { maxSteps: 143 }), ['a}', 'b'])
  assert.deepStrictEqual(expand('{a},b}', { maxSteps: 142 }), ['{a},b}'])

  // Partially: the groups the budget covered still expand, and the one it ran
  // out on stays literal along with the rest. The budget is one for the whole
  // call, so a later group does not get a fresh one. `{a,b}{c,d}` takes 62 up
  // to the end of its first set, then 48 for its second, which builds 4
  // results.
  assert.deepStrictEqual(expand('{a,b}{c,d}', { maxSteps: 110 }), [
    'ac',
    'ad',
    'bc',
    'bd',
  ])
  assert.deepStrictEqual(expand('{a,b}{c,d}', { maxSteps: 109 }), [
    'a{c,d}',
    'b{c,d}',
  ])
  assert.deepStrictEqual(expand('{a,b}{c,d}', { maxSteps: 62 }), [
    'a{c,d}',
    'b{c,d}',
  ])
  // A `${...}` group is kept as it is, which still costs its one result. At 20
  // that overdraws the budget after `${a}` is found, so `{b,c}` is not.
  assert.deepStrictEqual(expand('${a}{b,c}', { maxSteps: 20 }), [
    '${a}{b,c}',
  ])
  assert.deepStrictEqual(expand('${a}{b,c}', { maxSteps: 67 }), [
    '${a}b',
    '${a}c',
  ])

  // Only top-level groups expand partially. Within a set, the budget running
  // out anywhere - splitting its body, or expanding a member - leaves the
  // whole set literal, rather than split on commas that may belong to the sets
  // nested inside it or with some members expanded and others not.
  // `{{x},{a,b}}` takes 16 to start, 11 to find the set and 3 + 6 to split its
  // body, 20 for `{x}`, 62 for `{a,b}` and 3 for its results.
  assert.deepStrictEqual(expand('{{x},{a,b}}', { maxSteps: 121 }), [
    '{x}',
    'a',
    'b',
  ])
  assert.deepStrictEqual(expand('{{x},{a,b}}', { maxSteps: 120 }), [
    '{{x},{a,b}}',
  ])
  // At 35 the split stops with `{a,b}` unscanned.
  assert.deepStrictEqual(expand('{{x},{a,b}}', { maxSteps: 35 }), [
    '{{x},{a,b}}',
  ])

  // That holds for a set with a single part too, rather than having its
  // results wrapped and expanded again. `x{{a,b}}y` takes 16 to start, 8 to
  // find the set and 5 to split its body, 62 for `{a,b}`, 20 to expand each
  // wrapped result and 2 for its results. The `y` after it is literal anyway,
  // so the 3 steps it costs make no difference.
  assert.deepStrictEqual(expand('x{{a,b}}y', { maxSteps: 133 }), [
    'x{a}y',
    'x{b}y',
  ])
  assert.deepStrictEqual(expand('x{{a,b}}y', { maxSteps: 132 }), [
    'x{{a,b}}y',
  ])

  // Six sets nested to `maxDepth` take about 24M steps, more than the default
  // allows. It runs out just short of the end of the fifth, which stays
  // literal along with the sixth.
  const six = deepest.repeat(6)
  assert.strictEqual(expand(six).length, 16, 'the default stops short')
  assert.strictEqual(
    expand(six, { maxSteps: Infinity }).length,
    64,
    'Infinity expands every set'
  )
})

// Every comparison against NaN is false, so a NaN bound used to be one that
// is never reached: with `maxSteps: NaN` 15KB of this blocked the event loop
// for 16 seconds, and with `maxDepth: NaN` too, deep nesting overflowed the
// stack again (CVE-2026-102278).
test('options that are NaN get their defaults', async t => {
  const sets = '{,}'.repeat(5000)
  const startTime = performance.now()
  const capped = expand(sets, { maxSteps: NaN })
  const elapsed = performance.now() - startTime
  assert.deepStrictEqual(capped, expand(sets), 'maxSteps')
  assert.ok(
    elapsed < 2000,
    `Expected time (${elapsed}ms) to be less than 2000ms`
  )

  const deep = '{'.repeat(10000) + 'a,b' + '}'.repeat(10000)
  assert.deepStrictEqual(
    expand(deep, { maxDepth: NaN, maxSteps: NaN }),
    expand(deep),
    'maxDepth'
  )
  assert.strictEqual(
    expand('{1..200000}', { max: NaN }).length,
    100000,
    'max'
  )
  const long = '{a,b}'.repeat(1500)
  assert.deepStrictEqual(
    expand(long, { maxLength: NaN }),
    expand(long),
    'maxLength'
  )
  assert.deepStrictEqual(
    expand('{a},b}', { maxRewrites: NaN }),
    ['a}', 'b'],
    'maxRewrites'
  )

  // Infinity still lifts a bound.
  assert.strictEqual(
    expand('{1..200000}', { max: Infinity }).length,
    200000
  )
})
