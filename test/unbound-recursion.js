import test from 'node:test';
import assert from 'assert';
import expand from '../index.js';

test('unbound recursion', () => {
    const n = 5000
    const parts = []
    for (let i = 0; i < n; i++) parts.push('{}')
    const str = parts.join(',')
    const startTime = performance.now()
    const expanded = expand(str)
    const endTime = performance.now()
    const duration = endTime - startTime
    assert.deepStrictEqual(expanded, [str], 'does not expand')
    assert.ok(duration < 1000, `expected expansion to be less than 1000ms: ${duration}ms`)
})
