'use strict';
const expand = require('..');
const fs = require('fs');
const resfile = __dirname + '/../test/cases.txt';
const cases = fs.readFileSync(resfile, 'utf8').split('\n');

bench('Average', function() {
  cases.forEach(function(testcase) {
    expand(testcase);
  });
});
