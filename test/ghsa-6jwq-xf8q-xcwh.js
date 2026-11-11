var test = require('tape')
var expand = require('..')

// `maxDepth` bounds how many levels of nesting are followed, but each level
// still handed `balanced` - in `expand` and again in `parseCommaParts` - a
// string only two characters shorter than its parent's, so every level paid
// for the whole input again. 100KB of this shape blocked the event loop for
// 4.5 seconds to produce a single result.
test('rescanning nested sets is bounded', function (t) {
  var build = function (n) {
    return '{'.repeat(n) + 'a,b' + '}'.repeat(n)
  }

  // About 400KB. The budget caps the characters scanned rather than the input,
  // so this costs no more than the smallest payload that exhausts it.
  var startTime = performance.now()
  var expanded = expand(build(200000))
  var elapsed = performance.now() - startTime
  t.deepEqual(
    expanded,
    [build(200000)],
    'past the budget the input comes back literal'
  )
  t.ok(
    elapsed < 5000,
    'Expected time (' + elapsed + 'ms) to be less than 5000ms'
  )

  // Neither output bound applies: the payload yields a single result at any
  // size, so the cost is all in parsing.
  t.doesNotThrow(function () {
    expand(build(200000), { max: 1, maxLength: 1 })
  })

  t.end()
})

// When the innermost set expands to several results, the level above wraps
// each one in braces and scans it again, and so does every level after that.
// 484 bytes of this shape took 13 seconds to produce 9,708 results, and 2KB
// nested to `maxDepth` over a minute.
test('rescanning the results of nested sets is bounded', function (t) {
  var nest = function (n, inner) {
    return '{'.repeat(n) + inner + '}'.repeat(n)
  }
  var cases = [
    nest(200, '{a,b,c}'.repeat(12)),
    nest(1000, '{a,b,c,d,e,f,g,h,i,j}'.repeat(5)),
    nest(1000, '{,,,,,,,,,}'.repeat(5)),
  ]
  for (var i = 0; i < cases.length; i++) {
    // Once the budget is spent, every level above would still wrap each
    // result and try to expand it again - `maxDepth` times the result count,
    // none of it charged to the budget. The set stays literal instead.
    t.deepEqual(
      expand(cases[i]),
      [cases[i]],
      'past the budget the input comes back literal'
    )
  }

  t.end()
})

// Each scan is charged for the characters `balanced` walks - up to the closing
// `}` of the group it finds - not for the whole string it is handed, or a set
// with many groups would pay for its tail again at every one. A list at
// minimatch's 64KB pattern length cap needs about 432K steps.
test('a long list of sets expands in full', function (t) {
  var members = []
  for (var i = 0; i < 3920; i++) {
    members.push('pkg' + i + '/{a,b}.js')
  }
  var str = '{' + members.join(',') + '}'
  t.ok(str.length <= 64 * 1024, 'fits under the cap')
  var expanded = expand(str)
  t.equal(expanded.length, 7840, 'every member expands')
  t.equal(expanded[0], 'pkg0/a.js')
  t.equal(expanded[7839], 'pkg3919/b.js')

  t.end()
})

// Sequence values were never charged, and each group in a chain generated up
// to `max` of them however few combining could keep: 64KB of this blocked the
// event loop for 9 seconds and returned 610 results. Now the budget runs out a
// few groups in, and every result so far carries the rest of the chain
// literally, so `maxLength` leaves room for 62 of them.
test('generating sequence values is bounded', function (t) {
  var str = '{1..99999}'.repeat(6553)
  var expanded = expand(str)
  t.equal(expanded.length, 62, 'the budget runs out partway')
  t.ok(
    expanded.every(function (s) {
      return s.slice(-10) === '{1..99999}'
    }),
    'and the rest comes back literal'
  )

  t.end()
})

// A zero-padded value is built out to the width of the sequence's ends, which
// the input sets, but was charged one step like any other: 64KB of this took
// 7 seconds and returned 66 results. Each one costs a step per character now.
test('padded sequence values cost their width', function (t) {
  var str = ('{' + '0'.repeat(100) + '..99999}').repeat(595)
  var expanded = expand(str)
  t.equal(expanded.length, 61, 'the budget runs out partway')
  t.ok(
    expanded.every(function (s) {
      return s.slice(-8) === '..99999}'
    }),
    'and the rest comes back literal'
  )
  t.equal(expand('{00001..100000}').length, 100000, 'a real one expands')

  t.end()
})

// `max` and `maxLength` bound what one brace group builds, not how many groups
// build it. Results this short never reach `maxLength`, so every group in the
// chain rebuilt 100k of them: 52KB of the first blocked the event loop for 11
// seconds to return 100,000 results, and 64KB of the second for 14 to return
// none. Now the budget runs out partway, and `maxLength` leaves room for a few
// dozen results carrying the rest of the chain.
test('building results across chained groups is bounded', function (t) {
  t.equal(expand('{,a}'.repeat(13107)).length, 77)
  t.equal(expand('{,}'.repeat(21845)).length, 61)

  t.end()
})

// The sets inside build 100k empty results between them, which the set around
// them wraps and expands again one at a time. Each of those calls scans and
// builds next to nothing, so 64KB of this made 4M of them and returned 106
// results. Each call costs 16 steps of its own now.
test('expanding many short strings is bounded', function (t) {
  var set = '{' + ','.repeat(316) + '}'
  var str = ('{' + set + set + '}').repeat(100)
  t.equal(expand(str).length, 68)

  t.end()
})

// Bash drops empty results at the top level, and `combine` skipped them before
// checking `max` so they would not count against it - which left nothing to
// stop it visiting every pair of `acc` and `values` while keeping almost none.
// 64KB of this took 2 seconds. The empties are now skipped without being
// visited, so the result is the same and costs what it keeps.
test('dropping empty results is not quadratic', function (t) {
  var str = '{' + ','.repeat(32000) + 'x}{' + ','.repeat(32000) + '}'
  var startTime = performance.now()
  var expanded = expand(str)
  var elapsed = performance.now() - startTime
  t.equal(expanded.length, 32001, 'every result is kept')
  t.ok(
    expanded.every(function (s) {
      return s === 'x'
    }),
    'and only the empties are dropped'
  )
  t.ok(
    elapsed < 1000,
    'Expected time (' + elapsed + 'ms) to be less than 1000ms'
  )

  t.end()
})

// The `{a},b}` rewrite checked what follows the group with `/,(?!,).*\}/`,
// which backtracks through the rest of the line from every `,` - quadratic in
// that length - and checked it again on every pass. 7KB of this blocked the
// event loop for 10 seconds. The check is now one pass from the end.
test('the {a},b} check does not run in quadratic time', function (t) {
  var str = '{a}' + '}'.repeat(1000) + ',a'.repeat(3000) + '\n,}'
  var startTime = performance.now()
  var expanded = expand(str)
  var elapsed = performance.now() - startTime
  t.deepEqual(expanded, [str], 'the result is unchanged')
  t.ok(
    elapsed < 1000,
    'Expected time (' + elapsed + 'ms) to be less than 1000ms'
  )

  // It asks exactly what the regex did: a `,` not followed by another `,`,
  // with a `}` after it on the same line. `.` does not match line terminators,
  // so none of them may come between the two.
  t.deepEqual(expand('{a},b}'), ['a}', 'b'])
  t.deepEqual(expand('{a},}'), ['a}'])
  t.deepEqual(expand('{a},,b}'), ['a}', 'b'])
  t.deepEqual(expand('{a},\n,b}'), ['a}', '\n', 'b'])
  t.deepEqual(expand('{a},b}\n'), ['a}\n', 'b\n'])
  var eols = ['\n', '\r', '\u2028', '\u2029']
  for (var i = 0; i < eols.length; i++) {
    t.deepEqual(
      expand('{a},b' + eols[i] + '}'),
      ['{a},b' + eols[i] + '}'],
      'U+' +
        ('000' + eols[i].charCodeAt(0).toString(16)).slice(-4) +
        ' ends the line'
    )
  }

  // With no `}` after the commas the regex backtracked through the rest of
  // the line from every one of them, even without a rewrite to repeat it:
  // 256KB of this took 33 seconds.
  var commas = '{a}' + ',a'.repeat(131072)
  var commasStart = performance.now()
  t.deepEqual(expand(commas), [commas], 'a comma run stays literal')
  var commasElapsed = performance.now() - commasStart
  t.ok(
    commasElapsed < 1000,
    'Expected time (' + commasElapsed + 'ms) to be less than 1000ms'
  )

  t.end()
})

// `balanced` only learns that a `{` is unmatched by reading to the end of the
// string, so with one at the head of every group each scan read the rest of
// the input: 256KB of `'{a,{b,c}'.repeat(n)` took 25 seconds, and once the
// step budget charged for it, 64KB ran out partway through and came back half
// literal. The unmatched `{` are masked once they are found, so these now
// expand in full, well inside the budget.
test('unmatched braces ahead of every group are read once', function (t) {
  var units = ['{a,{b,c}', '{{a,b}', '{{1..2}']
  for (var i = 0; i < units.length; i++) {
    var str = units[i].repeat(Math.ceil(262144 / units[i].length))
    var startTime = performance.now()
    var expanded = expand(str)
    var elapsed = performance.now() - startTime
    t.ok(
      elapsed < 2000,
      units[i] +
        ': expected time (' +
        elapsed +
        'ms) to be less than 2000ms'
    )
    t.deepEqual(
      expanded,
      expand(str, { maxSteps: Infinity }),
      units[i] + ': the step budget does not run out'
    )
  }

  // The unmatched `{` stay literal, as in Bash.
  t.deepEqual(expand('{a,{b,c}'), ['{a,b', '{a,c'])
  t.deepEqual(expand('{{a,b}'), ['{a', '{b'])
  t.deepEqual(expand('{{a,b}{{c,d}'), ['{a{c', '{a{d', '{b{c', '{b{d'])
  // The `{a},b}` rewrite can leave the `{` it rewrote without a `}`.
  t.deepEqual(expand('{a},{b}'), ['{a},{b}'])
  t.deepEqual(expand('{a},{b,c}'), ['{a},b', '{a},c'])
  t.deepEqual(expand('{x{a},{b,c}'), ['{x{a},b', '{x{a},c'])
  t.deepEqual(expand('x{a},{b{c,d}'), ['x{a},{bc', 'x{a},{bd'])

  t.end()
})

// Escaped characters are swapped for placeholders while parsing, and the step
// budget charges for the characters it reads, placeholders included. They used
// to carry `Math.random()` as is, whose length varies, so input needing close
// to the default budget expanded in some processes and came back literal in
// others. They are a fixed length now, and this needs exactly 19,808,000 steps
// in every process.
test('escaped input costs the same in every process', function (t) {
  var str = '{'.repeat(1000) + 'a,b' + '\\,'.repeat(210) + '}'.repeat(1000)
  t.equal(expand(str).length, 2, 'it fits in the default')
  t.equal(expand(str, { maxSteps: 19808000 }).length, 2)
  // Literal, but unescaped as always.
  t.deepEqual(
    expand(str, { maxSteps: 19807999 }),
    [str.split('\\,').join(',')],
    'and one step less leaves it literal'
  )

  t.end()
})

test('maxSteps option bounds the work done', function (t) {
  // Real patterns need a few hundred steps at most. Below the bound the result
  // is exactly what an unbounded expansion produces.
  var cases = [
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
  ]
  for (var i = 0; i < cases.length; i++) {
    t.deepEqual(
      expand(cases[i], { maxSteps: 1000 }),
      expand(cases[i], { maxSteps: Infinity }),
      cases[i] + ' is unchanged below the bound'
    )
  }

  // The default leaves room for the deepest nesting `maxDepth` follows, which
  // takes about 4M steps.
  var deepest = '{'.repeat(1000) + 'a,b' + '}'.repeat(1000)
  t.deepEqual(
    expand(deepest),
    expand(deepest, { maxSteps: Infinity }),
    'nesting to maxDepth is unchanged by the default'
  )
  // Input that already hits `maxLength` in every group can run out, though:
  // this needs about 22M steps, and stops at 316 of the 800 results `maxLength`
  // leaves room for.
  t.equal(expand('{a,b}'.repeat(5000)).length, 316)

  // Past it, what is left stops expanding and comes back literal rather than
  // throwing - the same way `maxDepth` and `maxRewrites` truncate.
  t.deepEqual(expand('{a,b}', { maxSteps: 0 }), ['{a,b}'])
  t.deepEqual(expand('{a},b}', { maxSteps: 0 }), ['{a},b}'])
  t.deepEqual(expand('x{{a,b}}y', { maxSteps: 0 }), ['x{{a,b}}y'])

  // A scan costs the characters up to the closing `}` of the group it finds,
  // or the whole string when there is none, and each result built costs one.
  // Expanding a string - the pattern, or a member of a set - costs 16 more.
  // `{a,b}` takes 16 to start, 5 to find the set and 3 to split its body, 18
  // for each member - 16 to start, 1 to scan it and 1 for its result - and 2
  // for the set's results.
  t.deepEqual(expand('{a,b}', { maxSteps: 62 }), ['a', 'b'])
  t.deepEqual(expand('{a,b}', { maxSteps: 61 }), ['{a,b}'])
  // At 21 the set is found, but there is nothing left to split its body with.
  t.deepEqual(expand('{a,b}', { maxSteps: 21 }), ['{a,b}'])

  // Each value a sequence generates costs one too: `{1..3}` takes 16 to start,
  // 6 to find the set, 3 for its values and 3 for its results.
  t.deepEqual(expand('{1..3}', { maxSteps: 28 }), ['1', '2', '3'])
  t.deepEqual(expand('{1..3}', { maxSteps: 27 }), ['{1..3}'])
  // A zero-padded value costs one per character, so `{01..03}` takes 6 for
  // its values.
  t.deepEqual(expand('{01..03}', { maxSteps: 33 }), ['01', '02', '03'])
  t.deepEqual(expand('{01..03}', { maxSteps: 32 }), ['{01..03}'])

  // An unmatched `{` ahead of the set sends the search on to the end of the
  // string, and masking it so that later searches stop sooner reads it once
  // more, so `{{a,b}c` takes 7 to find the set rather than 6, and 7 to mask
  // it.
  t.deepEqual(expand('{{a,b}c', { maxSteps: 71 }), ['{ac', '{bc'])
  t.deepEqual(expand('{{a,b}c', { maxSteps: 70 }), ['{{a,b}c'])

  // The `{a},b}` check costs what follows the group, and the restart scans the
  // rewritten string, which holds an escape placeholder 25 characters long.
  // `{a},b}` takes 16 to start, 3 to find `{a}` and 3 to check `,b}`, 30 to
  // find the set in the rewritten string and 28 to split its body, 43 and 18
  // for its members, and 2 for its results.
  t.deepEqual(expand('{a},b}', { maxSteps: 143 }), ['a}', 'b'])
  t.deepEqual(expand('{a},b}', { maxSteps: 142 }), ['{a},b}'])

  // Partially: the groups the budget covered still expand, and the one it ran
  // out on stays literal along with the rest. The budget is one for the whole
  // call, so a later group does not get a fresh one. `{a,b}{c,d}` takes 62 up
  // to the end of its first set, then 48 for its second, which builds 4
  // results.
  t.deepEqual(expand('{a,b}{c,d}', { maxSteps: 110 }), [
    'ac',
    'ad',
    'bc',
    'bd',
  ])
  t.deepEqual(expand('{a,b}{c,d}', { maxSteps: 109 }), [
    'a{c,d}',
    'b{c,d}',
  ])
  t.deepEqual(expand('{a,b}{c,d}', { maxSteps: 62 }), ['a{c,d}', 'b{c,d}'])
  // A `${...}` group is kept as it is, which still costs its one result. At 20
  // that overdraws the budget after `${a}` is found, so `{b,c}` is not.
  t.deepEqual(expand('${a}{b,c}', { maxSteps: 20 }), ['${a}{b,c}'])
  t.deepEqual(expand('${a}{b,c}', { maxSteps: 67 }), ['${a}b', '${a}c'])

  // Only top-level groups expand partially. Within a set, the budget running
  // out anywhere - splitting its body, or expanding a member - leaves the
  // whole set literal, rather than split on commas that may belong to the sets
  // nested inside it or with some members expanded and others not.
  // `{{x},{a,b}}` takes 16 to start, 11 to find the set and 3 + 6 to split its
  // body, 20 for `{x}`, 62 for `{a,b}` and 3 for its results.
  t.deepEqual(expand('{{x},{a,b}}', { maxSteps: 121 }), ['{x}', 'a', 'b'])
  t.deepEqual(expand('{{x},{a,b}}', { maxSteps: 120 }), ['{{x},{a,b}}'])
  // At 35 the split stops with `{a,b}` unscanned.
  t.deepEqual(expand('{{x},{a,b}}', { maxSteps: 35 }), ['{{x},{a,b}}'])

  // That holds for a set with a single part too, rather than having its
  // results wrapped and expanded again. `x{{a,b}}y` takes 16 to start, 8 to
  // find the set and 5 to split its body, 62 for `{a,b}`, 20 to expand each
  // wrapped result and 2 for its results. The `y` after it is literal anyway,
  // so the 3 steps it costs make no difference.
  t.deepEqual(expand('x{{a,b}}y', { maxSteps: 133 }), ['x{a}y', 'x{b}y'])
  t.deepEqual(expand('x{{a,b}}y', { maxSteps: 132 }), ['x{{a,b}}y'])

  // Six sets nested to `maxDepth` take about 24M steps, more than the default
  // allows. It runs out just short of the end of the fifth, which stays
  // literal along with the sixth.
  var six = deepest.repeat(6)
  t.equal(expand(six).length, 16, 'the default stops short')
  t.equal(
    expand(six, { maxSteps: Infinity }).length,
    64,
    'Infinity expands every set'
  )

  t.end()
})

// Every comparison against NaN is false, so a NaN bound used to be one that
// is never reached: with `maxSteps: NaN` 15KB of this blocked the event loop
// for 16 seconds, and with `maxDepth: NaN` too, deep nesting overflowed the
// stack again (CVE-2026-102278).
test('options that are NaN get their defaults', function (t) {
  var sets = '{,}'.repeat(5000)
  var startTime = performance.now()
  var capped = expand(sets, { maxSteps: NaN })
  var elapsed = performance.now() - startTime
  t.deepEqual(capped, expand(sets), 'maxSteps')
  t.ok(
    elapsed < 2000,
    'Expected time (' + elapsed + 'ms) to be less than 2000ms'
  )

  var deep = '{'.repeat(10000) + 'a,b' + '}'.repeat(10000)
  t.deepEqual(
    expand(deep, { maxDepth: NaN, maxSteps: NaN }),
    expand(deep),
    'maxDepth'
  )
  t.equal(expand('{1..200000}', { max: NaN }).length, 100000, 'max')
  var long = '{a,b}'.repeat(1500)
  t.deepEqual(expand(long, { maxLength: NaN }), expand(long), 'maxLength')
  t.deepEqual(
    expand('{a},b}', { maxRewrites: NaN }),
    ['a}', 'b'],
    'maxRewrites'
  )

  // Infinity still lifts a bound.
  t.equal(expand('{1..200000}', { max: Infinity }).length, 200000)

  t.end()
})
