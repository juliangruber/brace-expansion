import test from 'node:test'
import assert from 'assert'
import { expand } from '../dist/esm/index.js'
import fs from 'fs'

const resfile = new URL('./bash-results.txt', import.meta.url)
const cases = fs.readFileSync(resfile, 'utf8').split('><><><><')

// throw away the EOF marker
cases.pop()

test('matches bash expansions', function () {
  cases.forEach(function (testcase) {
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

    assert.deepStrictEqual(actual, set, pattern)
  })
})
