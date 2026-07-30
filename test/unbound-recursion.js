var test = require('tape')
var expand = require('..')

// https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-3jxr-9vmj-r5cp
test('unbound recursion', async t => {
  // A run of non-expanding `{}` groups used to expand `post` once per group,
  // doubling the work on every group. This 30-group, 90 byte input blocked
  // for minutes.
  const str =
    'a{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}'
  const startTime = performance.now()
  const expanded = expand(str)
  const endTime = performance.now()
  const timeTaken = endTime - startTime
  t.deepEqual(expanded, [str], 'does not expand')
  t.ok(
    timeTaken < 1000,
    `Expected time (${timeTaken}ms) to be less than 1000ms`,
  )
  t.end()
})
