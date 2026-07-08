var test = require('tape');
var expand = require('..');

test('unbound recursion', function (t) {
    const n = 5000
    const parts = []
    for (let i = 0; i < n; i++) parts.push('{}')
    const str = parts.join(',')
    const startTime = performance.now()
    const expanded = expand(str)
    const endTime = performance.now()
    const duration = endTime - startTime
    t.deepEqual(expanded, [str], 'does not expand')
    t.ok(duration < 5000, `expected expansion to be less than 5000ms: ${duration}ms`)
    t.end()
})
