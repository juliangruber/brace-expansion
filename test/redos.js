import test from 'node:test'
import assert from 'assert'
import { expand } from '../dist/esm/index.js'

test('redos', function () {
  const str = '{a}' + ','.repeat(100000) + '\u0000'
  const startTime = performance.now()
  expand(str)
  const endTime = performance.now()
  const timeTaken = endTime - startTime
  assert.ok(timeTaken < 1000, `Expected time (${timeTaken}ms) to be less than 1000ms`)
})
