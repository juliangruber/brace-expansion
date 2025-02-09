import test from 'node:test'
import assert from 'assert'
import expand from '../index.js'

test('redos', function () {
let str = "{a}" + ",".repeat(100000) + "\u0000";
//let str = "{a}" + ",".repeat(100000) + "\n@";
    let startTime = performance.now();
    expand(str)
    let endTime = performance.now();
    let timeTaken = endTime - startTime;
    assert.ok(timeTaken < 1000, `Expected time (${timeTaken}ms) to be less than 1000ms`);
})



