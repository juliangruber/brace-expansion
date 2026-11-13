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

// In bash, a group whose body has a top-level `..` but is not a valid
// sequence is a failed sequence, and it stays literal together with every
// group nested in it.
t.test('a failed sequence keeps its nested groups literal', async t => {
  for (const pattern of [
    '{{1..2}..3}',
    '{a..{1..2}}',
    '{..{1..2}}',
    '{{1..2}x..x}',
    '{a..x{1..2}}',
    '{{1..2}...a}',
    '{{1..2}..{1..2}}',
    'x{..{1..2}}y',
    '{{1..2}..1}{a}',
  ]) {
    t.strictSame(expand(pattern), [pattern], pattern)
  }
})

// In bash, a `}` only closes a group once a top-level `,` or `..` has come
// before it. Here the group opened by the first `{` therefore runs past the
// `}` that matches it to a later one, and the whole span is a failed
// sequence that stays literal.
t.test('a failed sequence can run past the first }', async t => {
  for (const pattern of [
    '{a}..{1..2}}',
    '{a}..{1..2}}}',
    '{a}{1..2}..b}',
    '{{1..2}}..b}',
    '.{a}..b{1..2}}x',
    '{a}{1..2}..b1}{a}',
  ]) {
    t.strictSame(expand(pattern), [pattern], pattern)
  }
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

// The tail fix above bounds stack depth for *chained* groups. Nesting drives a
// different recursion - one level per `{` for a set's comma members, and one
// for a set whose body is a single part - which stayed unbounded. Only ~6KB of
// `{{{...a,b...}}}` was enough to exhaust the stack.
//
// Both payloads take more steps than `maxSteps` allows by default, which would
// stop them well short of `maxDepth`. It is lifted here, so that `maxDepth` is
// what keeps them safe.
t.test('deep nesting does not overflow the stack', async t => {
  // A set nested inside every comma member.
  const members = '{a,'.repeat(10_000) + 'z' + '}'.repeat(10_000)
  t.doesNotThrow(() => {
    t.ok(
      expand(members, { maxSteps: Infinity }).length > 0,
      'comma members still return a result',
    )
  })

  // A set whose body parses to a single part, nested all the way down. This is
  // the cheapest payload: it crashed at ~3,100 levels, about 6KB of input.
  const single = '{'.repeat(10_000) + 'a,b' + '}'.repeat(10_000)
  t.doesNotThrow(() => {
    t.ok(
      expand(single, { maxSteps: Infinity }).length > 0,
      'single set still returns a result',
    )
  })

  // Neither bound could prevent this - the payloads expand to almost nothing,
  // so the result set never reaches either limit.
  t.doesNotThrow(
    () => expand(single, { max: 1, maxLength: 1, maxSteps: Infinity }),
    'still safe with both output bounds at their lowest',
  )
})

t.test('maxDepth option bounds nesting depth', async t => {
  // The bound counts levels of nesting followed, so a flat set never needs any:
  // its members are literals, and expanding them is what would recurse.
  t.strictSame(expand('{a,b}', { maxDepth: 0 }), ['a', 'b'])

  // Each further level costs one. Below the bound the result is exactly what an
  // unbounded expansion produces.
  for (const str of [
    '{a,b}',
    '{{a,b}}',
    '{{{a,b}}}',
    '{a,{b,c}}',
    '{a,{b,{c,d}}}',
    'x{{a,b}}y',
  ]) {
    t.strictSame(
      expand(str, { maxDepth: 50 }),
      expand(str),
      `${str} is unchanged below the bound`,
    )
  }

  // Past it, the group stops expanding and comes back literal rather than
  // throwing - the same way a group that cannot expand is already handled.
  t.strictSame(expand('{{a,b}}', { maxDepth: 0 }), ['{{a,b}}'])
  t.strictSame(expand('{{{a,b}}}', { maxDepth: 1 }), ['{{{a,b}}}'])
  t.strictSame(expand('x{{a,b}}y', { maxDepth: 0 }), ['x{{a,b}}y'])

  // Partially: the levels within the bound still expand.
  t.strictSame(expand('{a,{b,c}}', { maxDepth: 0 }), ['a', '{b,c}'])
  t.strictSame(expand('{a,{b,{c,d}}}', { maxDepth: 1 }), [
    'a',
    'b',
    '{c,d}',
  ])
})

// The same guarantee for the *parsing* side. `parseCommaParts` recursed on the
// remainder of the string once per brace group, so chaining groups inside a
// brace set exhausted the stack at ~7,000 groups (~29KB of input) even though
// the identical chain outside one was already safe.
t.test(
  'deeply chained comma groups do not overflow the stack',
  async t => {
    const str = '{' + '{a},'.repeat(50_000) + 'b}'
    t.doesNotThrow(() => {
      const expanded = expand(str)
      t.equal(expanded.length, 50_001, 'every member is kept')
    })
    // The overflow happened while parsing, before anything was expanded, so
    // neither bound could prevent it - and neither is what keeps it safe now.
    t.doesNotThrow(
      () => expand(str, { max: 1, maxLength: 1 }),
      'still safe with both bounds set as low as they go',
    )
  },
)

// `push.apply(target, items)` passes one argument per element, so a single
// large array overflowed the stack with no recursion at all - this input
// reaches a recursion depth of one.
t.test('a large comma set does not overflow the stack', async t => {
  const str = '{{x},' + 'a,'.repeat(200_000) + 'b}'
  t.doesNotThrow(() => {
    const expanded = expand(str)
    t.ok(expanded.length > 0, 'still returns a (truncated) result')
  })
})

// Bash keeps a quirk where a brace group followed by a comma set still expands
// (`{a},b}`). The parser rewrites the string and restarts the scan, absorbing
// one `}` per pass, so `n` trailing braces cost `n` passes over a string that
// itself grows by one `escClose` sentinel each time - quadratic in `n`. 128KB
// of this shape blocked the event loop for 27 seconds to produce 2 results.
t.test('the {a},b} rewrite does not run in quadratic time', async t => {
  const build = n => '{a}' + '}'.repeat(n) + ',z}'

  const startTime = performance.now()
  expand(build(128_000))
  const elapsed = performance.now() - startTime
  t.ok(
    elapsed < 2000,
    `Expected time (${elapsed}ms) to be less than 2000ms`,
  )

  // Neither output bound applies: the payload yields a couple of results at any
  // size, so the cost is all in parsing.
  t.doesNotThrow(() => expand(build(128_000), { max: 1, maxLength: 1 }))
})

t.test('maxRewrites option bounds the rescan count', async t => {
  const build = n => '{a}' + '}'.repeat(n) + ',z}'

  // Real `{a},b}` input needs a handful of passes, and is untouched.
  t.strictSame(expand('{a},b}'), ['a}', 'b'])
  t.strictSame(expand('a{},b}c'), ['a}c', 'abc'])
  t.strictSame(expand('{a},b}', { maxRewrites: 1000 }), expand('{a},b}'))

  // Below the bound the result matches an unbounded expansion exactly.
  for (const n of [1, 10, 100]) {
    t.strictSame(
      expand(build(n), { maxRewrites: 1000 }),
      expand(build(n), { maxRewrites: 100_000 }),
      `${n} trailing braces are unchanged below the bound`,
    )
  }

  // Past it the scan stops restarting and the rest stays literal, rather than
  // throwing - the same way `max` and `maxLength` truncate.
  t.strictSame(expand('{a},b}', { maxRewrites: 0 }), ['{a},b}'])
  t.ok(
    expand(build(50), { maxRewrites: 10 })[0].startsWith('{a}'),
    'past the bound the group comes back literal',
  )
})

// `maxDepth` bounds how many levels of nesting are followed, but each level
// still handed `balanced` - in `expand_` and again in `parseCommaParts` - a
// string only two characters shorter than its parent's, so every level paid
// for the whole input again. 100KB of this shape blocked the event loop for
// 4.5 seconds to produce a single result.
t.test('rescanning nested sets is bounded', async t => {
  const build = n => '{'.repeat(n) + 'a,b' + '}'.repeat(n)

  // About 400KB. The budget caps the characters scanned rather than the input,
  // so this costs no more than the smallest payload that exhausts it.
  const startTime = performance.now()
  const expanded = expand(build(200_000))
  const elapsed = performance.now() - startTime
  t.strictSame(
    expanded,
    [build(200_000)],
    'past the budget the input comes back literal',
  )
  t.ok(
    elapsed < 5000,
    `Expected time (${elapsed}ms) to be less than 5000ms`,
  )

  // Neither output bound applies: the payload yields a single result at any
  // size, so the cost is all in parsing.
  t.doesNotThrow(() => expand(build(200_000), { max: 1, maxLength: 1 }))
})

// When the innermost set expands to several results, the level above wraps
// each one in braces and scans it again, and so does every level after that.
// 484 bytes of this shape took 13 seconds to produce 9,708 results, and 2KB
// nested to `maxDepth` over a minute.
t.test('rescanning the results of nested sets is bounded', async t => {
  const nest = (n, inner) => '{'.repeat(n) + inner + '}'.repeat(n)
  for (const str of [
    nest(200, '{a,b,c}'.repeat(12)),
    nest(1000, '{a,b,c,d,e,f,g,h,i,j}'.repeat(5)),
    nest(1000, '{,,,,,,,,,}'.repeat(5)),
  ]) {
    // Once the budget is spent, every level above would still wrap each
    // result and try to expand it again - `maxDepth` times the result count,
    // none of it charged to the budget. The set stays literal instead.
    t.strictSame(
      expand(str),
      [str],
      'past the budget the input comes back literal',
    )
  }
})

// Each scan is charged for the characters `balanced` walks - up to the closing
// `}` of the group it finds - not for the whole string it is handed, or a set
// with many groups would pay for its tail again at every one. A list at
// minimatch's 64KB pattern length cap needs about 432K steps.
t.test('a long list of sets expands in full', async t => {
  const str =
    '{' +
    Array.from({ length: 3_920 }, (_, i) => `pkg${i}/{a,b}.js`).join(',') +
    '}'
  t.ok(str.length <= 64 * 1024, 'fits under the cap')
  const expanded = expand(str)
  t.equal(expanded.length, 7_840, 'every member expands')
  t.equal(expanded[0], 'pkg0/a.js')
  t.equal(expanded[7_839], 'pkg3919/b.js')
})

// Sequence values were never charged, and each group in a chain generated up
// to `max` of them however few combining could keep: 64KB of this blocked the
// event loop for 9 seconds and returned 610 results. Now the budget runs out a
// few groups in, and every result so far carries the rest of the chain
// literally, so `maxLength` leaves room for 62 of them.
t.test('generating sequence values is bounded', async t => {
  const str = '{1..99999}'.repeat(6553)
  const expanded = expand(str)
  t.equal(expanded.length, 62, 'the budget runs out partway')
  t.ok(
    expanded.every(s => s.endsWith('{1..99999}')),
    'and the rest comes back literal',
  )
})

// A zero-padded value is built out to the width of the sequence's ends, which
// the input sets, but was charged one step like any other: 64KB of this took
// 7 seconds and returned 66 results. Each one costs a step per character now.
t.test('padded sequence values cost their width', async t => {
  const str = ('{' + '0'.repeat(100) + '..99999}').repeat(595)
  const expanded = expand(str)
  t.equal(expanded.length, 61, 'the budget runs out partway')
  t.ok(
    expanded.every(s => s.endsWith('..99999}')),
    'and the rest comes back literal',
  )
  t.equal(expand('{00001..100000}').length, 100_000, 'a real one expands')
})

// `max` and `maxLength` bound what one brace group builds, not how many groups
// build it. Results this short never reach `maxLength`, so every group in the
// chain rebuilt 100k of them: 52KB of the first blocked the event loop for 11
// seconds to return 100,000 results, and 64KB of the second for 14 to return
// none. Now the budget runs out partway, and `maxLength` leaves room for a few
// dozen results carrying the rest of the chain.
t.test('building results across chained groups is bounded', async t => {
  t.equal(expand('{,a}'.repeat(13_107)).length, 77)
  t.equal(expand('{,}'.repeat(21_845)).length, 61)
})

// The sets inside build 100k empty results between them, which the set around
// them wraps and expands again one at a time. Each of those calls scans and
// builds next to nothing, so 64KB of this made 4M of them and returned 106
// results. Each call costs 16 steps of its own now.
t.test('expanding many short strings is bounded', async t => {
  const set = '{' + ','.repeat(316) + '}'
  const str = ('{' + set + set + '}').repeat(100)
  t.equal(expand(str).length, 68)
})

// Bash drops empty results at the top level, and `combine` skipped them before
// checking `max` so they would not count against it - which left nothing to
// stop it visiting every pair of `acc` and `values` while keeping almost none.
// 64KB of this took 2 seconds. The empties are now skipped without being
// visited, so the result is the same and costs what it keeps.
t.test('dropping empty results is not quadratic', async t => {
  const str = '{' + ','.repeat(32_000) + 'x}{' + ','.repeat(32_000) + '}'
  const startTime = performance.now()
  const expanded = expand(str)
  const elapsed = performance.now() - startTime
  t.equal(expanded.length, 32_001, 'every result is kept')
  t.ok(
    expanded.every(s => s === 'x'),
    'and only the empties are dropped',
  )
  t.ok(
    elapsed < 1000,
    `Expected time (${elapsed}ms) to be less than 1000ms`,
  )
})

// The `{a},b}` rewrite checked what follows the group with `/,(?!,).*\}/`,
// which backtracks through the rest of the line from every `,` - quadratic in
// that length - and checked it again on every pass. 7KB of this blocked the
// event loop for 10 seconds. The check is now one pass from the end.
t.test('the {a},b} check does not run in quadratic time', async t => {
  const str = '{a}' + '}'.repeat(1000) + ',a'.repeat(3000) + '\n,}'
  const startTime = performance.now()
  const expanded = expand(str)
  const elapsed = performance.now() - startTime
  t.strictSame(expanded, [str], 'the result is unchanged')
  t.ok(
    elapsed < 1000,
    `Expected time (${elapsed}ms) to be less than 1000ms`,
  )

  // It asks exactly what the regex did: a `,` not followed by another `,`,
  // with a `}` after it on the same line. `.` does not match line terminators,
  // so none of them may come between the two.
  t.strictSame(expand('{a},b}'), ['a}', 'b'])
  t.strictSame(expand('{a},}'), ['a}'])
  t.strictSame(expand('{a},,b}'), ['a}', 'b'])
  t.strictSame(expand('{a},\n,b}'), ['a}', '\n', 'b'])
  t.strictSame(expand('{a},b}\n'), ['a}\n', 'b\n'])
  for (const eol of ['\n', '\r', '\u2028', '\u2029']) {
    t.strictSame(
      expand('{a},b' + eol + '}'),
      ['{a},b' + eol + '}'],
      `U+${eol.charCodeAt(0).toString(16).padStart(4, '0')} ends the line`,
    )
  }

  // With no `}` after the commas the regex backtracked through the rest of
  // the line from every one of them, even without a rewrite to repeat it:
  // 256KB of this took 33 seconds.
  const commas = '{a}' + ',a'.repeat(131_072)
  const commasStart = performance.now()
  t.strictSame(expand(commas), [commas], 'a comma run stays literal')
  const commasElapsed = performance.now() - commasStart
  t.ok(
    commasElapsed < 1000,
    `Expected time (${commasElapsed}ms) to be less than 1000ms`,
  )
})

// `balanced` only learns that a `{` is unmatched by reading to the end of the
// string, so with one at the head of every group each scan read the rest of
// the input: 256KB of `'{a,{b,c}'.repeat(n)` took 25 seconds, and once the
// step budget charged for it, 64KB ran out partway through and came back half
// literal. The unmatched `{` are masked once they are found, so these now
// expand in full, well inside the budget.
t.test('unmatched braces ahead of every group are read once', async t => {
  for (const unit of ['{a,{b,c}', '{{a,b}', '{{1..2}']) {
    const str = unit.repeat(Math.ceil(262_144 / unit.length))
    const startTime = performance.now()
    const expanded = expand(str)
    const elapsed = performance.now() - startTime
    t.ok(
      elapsed < 2000,
      `${unit}: expected time (${elapsed}ms) to be less than 2000ms`,
    )
    t.strictSame(
      expanded,
      expand(str, { maxSteps: Infinity }),
      `${unit}: the step budget does not run out`,
    )
  }

  // The unmatched `{` stay literal, as in Bash.
  t.strictSame(expand('{a,{b,c}'), ['{a,b', '{a,c'])
  t.strictSame(expand('{{a,b}'), ['{a', '{b'])
  t.strictSame(expand('{{a,b}{{c,d}'), ['{a{c', '{a{d', '{b{c', '{b{d'])
  // The `{a},b}` rewrite can leave the `{` it rewrote without a `}`.
  t.strictSame(expand('{a},{b}'), ['{a},{b}'])
  t.strictSame(expand('{a},{b,c}'), ['{a},b', '{a},c'])
  t.strictSame(expand('{x{a},{b,c}'), ['{x{a},b', '{x{a},c'])
  t.strictSame(expand('x{a},{b{c,d}'), ['x{a},{bc', 'x{a},{bd'])
})

// Escaped characters are swapped for placeholders while parsing, and the step
// budget charges for the characters it reads, placeholders included. They used
// to carry `Math.random()` as is, whose length varies, so input needing close
// to the default budget expanded in some processes and came back literal in
// others. They are a fixed length now, and this needs exactly 19,808,000 steps
// in every process.
t.test('escaped input costs the same in every process', async t => {
  const str =
    '{'.repeat(1000) + 'a,b' + '\\,'.repeat(210) + '}'.repeat(1000)
  t.equal(expand(str).length, 2, 'it fits in the default')
  t.equal(expand(str, { maxSteps: 19_808_000 }).length, 2)
  // Literal, but unescaped as always.
  t.strictSame(
    expand(str, { maxSteps: 19_807_999 }),
    [str.split('\\,').join(',')],
    'and one step less leaves it literal',
  )
})

t.test('maxSteps option bounds the work done', async t => {
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
    t.strictSame(
      expand(str, { maxSteps: 1000 }),
      expand(str, { maxSteps: Infinity }),
      `${str} is unchanged below the bound`,
    )
  }

  // The default leaves room for the deepest nesting `maxDepth` follows, which
  // takes about 4M steps.
  const deepest = '{'.repeat(1000) + 'a,b' + '}'.repeat(1000)
  t.strictSame(
    expand(deepest),
    expand(deepest, { maxSteps: Infinity }),
    'nesting to maxDepth is unchanged by the default',
  )
  // Input that already hits `maxLength` in every group can run out, though:
  // this needs about 22M steps, and stops at 316 of the 800 results `maxLength`
  // leaves room for.
  t.equal(expand('{a,b}'.repeat(5000)).length, 316)

  // Past it, what is left stops expanding and comes back literal rather than
  // throwing - the same way `maxDepth` and `maxRewrites` truncate.
  t.strictSame(expand('{a,b}', { maxSteps: 0 }), ['{a,b}'])
  t.strictSame(expand('{a},b}', { maxSteps: 0 }), ['{a},b}'])
  t.strictSame(expand('x{{a,b}}y', { maxSteps: 0 }), ['x{{a,b}}y'])

  // A scan costs the characters up to the closing `}` of the group it finds,
  // or the whole string when there is none, and each result built costs one.
  // Expanding a string - the pattern, or a member of a set - costs 16 more.
  // `{a,b}` takes 16 to start, 5 to find the set and 3 to split its body, 18
  // for each member - 16 to start, 1 to scan it and 1 for its result - and 2
  // for the set's results.
  t.strictSame(expand('{a,b}', { maxSteps: 62 }), ['a', 'b'])
  t.strictSame(expand('{a,b}', { maxSteps: 61 }), ['{a,b}'])
  // At 21 the set is found, but there is nothing left to split its body with.
  t.strictSame(expand('{a,b}', { maxSteps: 21 }), ['{a,b}'])

  // Each value a sequence generates costs one too: `{1..3}` takes 16 to start,
  // 6 to find the set, 3 for its values and 3 for its results.
  t.strictSame(expand('{1..3}', { maxSteps: 28 }), ['1', '2', '3'])
  t.strictSame(expand('{1..3}', { maxSteps: 27 }), ['{1..3}'])
  // A zero-padded value costs one per character, so `{01..03}` takes 6 for
  // its values.
  t.strictSame(expand('{01..03}', { maxSteps: 33 }), ['01', '02', '03'])
  t.strictSame(expand('{01..03}', { maxSteps: 32 }), ['{01..03}'])

  // An unmatched `{` ahead of the set sends the search on to the end of the
  // string, and masking it so that later searches stop sooner reads it once
  // more, so `{{a,b}c` takes 7 to find the set rather than 6, and 7 to mask
  // it.
  t.strictSame(expand('{{a,b}c', { maxSteps: 71 }), ['{ac', '{bc'])
  t.strictSame(expand('{{a,b}c', { maxSteps: 70 }), ['{{a,b}c'])

  // The `{a},b}` check costs what follows the group, and the restart scans the
  // rewritten string, which holds an escape placeholder 25 characters long.
  // `{a},b}` takes 16 to start, 3 to find `{a}` and 3 to check `,b}`, 30 to
  // find the set in the rewritten string and 28 to split its body, 43 and 18
  // for its members, and 2 for its results.
  t.strictSame(expand('{a},b}', { maxSteps: 143 }), ['a}', 'b'])
  t.strictSame(expand('{a},b}', { maxSteps: 142 }), ['{a},b}'])

  // Partially: the groups the budget covered still expand, and the one it ran
  // out on stays literal along with the rest. The budget is one for the whole
  // call, so a later group does not get a fresh one. `{a,b}{c,d}` takes 62 up
  // to the end of its first set, then 48 for its second, which builds 4
  // results.
  t.strictSame(expand('{a,b}{c,d}', { maxSteps: 110 }), [
    'ac',
    'ad',
    'bc',
    'bd',
  ])
  t.strictSame(expand('{a,b}{c,d}', { maxSteps: 109 }), [
    'a{c,d}',
    'b{c,d}',
  ])
  t.strictSame(expand('{a,b}{c,d}', { maxSteps: 62 }), [
    'a{c,d}',
    'b{c,d}',
  ])
  // A `${...}` group is kept as it is, which still costs its one result. At 20
  // that overdraws the budget after `${a}` is found, so `{b,c}` is not.
  t.strictSame(expand('${a}{b,c}', { maxSteps: 20 }), ['${a}{b,c}'])
  t.strictSame(expand('${a}{b,c}', { maxSteps: 67 }), ['${a}b', '${a}c'])

  // Only top-level groups expand partially. Within a set, the budget running
  // out anywhere - splitting its body, or expanding a member - leaves the
  // whole set literal, rather than split on commas that may belong to the sets
  // nested inside it or with some members expanded and others not.
  // `{{x},{a,b}}` takes 16 to start, 11 to find the set and 3 + 6 to split its
  // body, 20 for `{x}`, 62 for `{a,b}` and 3 for its results.
  t.strictSame(expand('{{x},{a,b}}', { maxSteps: 121 }), ['{x}', 'a', 'b'])
  t.strictSame(expand('{{x},{a,b}}', { maxSteps: 120 }), ['{{x},{a,b}}'])
  // At 35 the split stops with `{a,b}` unscanned.
  t.strictSame(expand('{{x},{a,b}}', { maxSteps: 35 }), ['{{x},{a,b}}'])

  // That holds for a set with a single part too, rather than having its
  // results wrapped and expanded again. `x{{a,b}}y` takes 16 to start, 8 to
  // find the set and 5 to split its body, 62 for `{a,b}`, 20 to expand each
  // wrapped result and 2 for its results. The `y` after it is literal anyway,
  // so the 3 steps it costs make no difference.
  t.strictSame(expand('x{{a,b}}y', { maxSteps: 133 }), ['x{a}y', 'x{b}y'])
  t.strictSame(expand('x{{a,b}}y', { maxSteps: 132 }), ['x{{a,b}}y'])

  // Six sets nested to `maxDepth` take about 24M steps, more than the default
  // allows. It runs out just short of the end of the fifth, which stays
  // literal along with the sixth.
  const six = deepest.repeat(6)
  t.equal(expand(six).length, 16, 'the default stops short')
  t.equal(
    expand(six, { maxSteps: Infinity }).length,
    64,
    'Infinity expands every set',
  )
})

// Every comparison against NaN is false, so a NaN bound used to be one that
// is never reached: with `maxSteps: NaN` 15KB of this blocked the event loop
// for 16 seconds, and with `maxDepth: NaN` too, deep nesting overflowed the
// stack again (CVE-2026-102278).
t.test('options that are NaN get their defaults', async t => {
  const sets = '{,}'.repeat(5000)
  const startTime = performance.now()
  const capped = expand(sets, { maxSteps: NaN })
  const elapsed = performance.now() - startTime
  t.strictSame(capped, expand(sets), 'maxSteps')
  t.ok(
    elapsed < 2000,
    `Expected time (${elapsed}ms) to be less than 2000ms`,
  )

  const deep = '{'.repeat(10000) + 'a,b' + '}'.repeat(10000)
  t.strictSame(
    expand(deep, { maxDepth: NaN, maxSteps: NaN }),
    expand(deep),
    'maxDepth',
  )
  t.equal(expand('{1..200000}', { max: NaN }).length, 100000, 'max')
  const long = '{a,b}'.repeat(1500)
  t.strictSame(expand(long, { maxLength: NaN }), expand(long), 'maxLength')
  t.strictSame(
    expand('{a},b}', { maxRewrites: NaN }),
    ['a}', 'b'],
    'maxRewrites',
  )

  // Infinity still lifts a bound.
  t.equal(expand('{1..200000}', { max: Infinity }).length, 200000)
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
