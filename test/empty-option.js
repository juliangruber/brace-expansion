import test from 'node:test'
import assert from 'assert'
import { expand } from '../dist/esm/index.js'

test('empty option', function () {
  assert.deepStrictEqual(expand('-v{,,,,}'), [
    '-v', '-v', '-v', '-v', '-v'
  ])
})
