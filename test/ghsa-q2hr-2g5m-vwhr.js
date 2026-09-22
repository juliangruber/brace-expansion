var test = require('tape')
var expand = require('..')

// Bash keeps a quirk where a brace group followed by a comma set still expands
// (`{a},b}`). The parser rewrites the string and restarts the scan, absorbing
// one `}` per pass, so `n` trailing braces cost `n` passes over a string that
// itself grows by one `escClose` sentinel each time - quadratic in `n`. 128KB
// of this shape blocked the event loop for 27 seconds to produce 2 results.
test('the {a},b} rewrite does not run in quadratic time', function (t) {
  var build = function (n) {
    return '{a}' + '}'.repeat(n) + ',z}'
  }

  var startTime = performance.now()
  expand(build(128000))
  var elapsed = performance.now() - startTime
  t.ok(
    elapsed < 2000,
    'Expected time (' + elapsed + 'ms) to be less than 2000ms'
  )

  // Neither output bound applies: the payload yields a couple of results at any
  // size, so the cost is all in parsing.
  t.doesNotThrow(function () {
    expand(build(128000), { max: 1, maxLength: 1 })
  })

  t.end()
})

test('maxRewrites option bounds the rescan count', function (t) {
  var build = function (n) {
    return '{a}' + '}'.repeat(n) + ',z}'
  }

  // Real `{a},b}` input needs a handful of passes, and is untouched.
  t.deepEqual(expand('{a},b}'), ['a}', 'b'])
  t.deepEqual(expand('a{},b}c'), ['a}c', 'abc'])

  // Below the bound the result matches an unbounded expansion exactly.
  var ns = [1, 10, 100]
  for (var i = 0; i < ns.length; i++) {
    t.deepEqual(
      expand(build(ns[i]), { maxRewrites: 1000 }),
      expand(build(ns[i]), { maxRewrites: 100000 }),
      ns[i] + ' trailing braces are unchanged below the bound'
    )
  }

  // Past it the scan stops restarting and the rest stays literal, rather than
  // throwing - the same way `max` and `maxLength` truncate.
  t.deepEqual(expand('{a},b}', { maxRewrites: 0 }), ['{a},b}'])
  t.ok(
    expand(build(50), { maxRewrites: 10 })[0].indexOf('{a}') === 0,
    'past the bound the group comes back literal'
  )

  t.end()
})
