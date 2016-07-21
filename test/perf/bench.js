'use strict';
var expand = require('../../');
var fs = require('fs');
var resfile = __dirname + '/../cases.txt';
var cases = fs.readFileSync(resfile, 'utf8').split('\n');

suite('bash expansions', function () {
  set('iterations', 2000);

  bench('Average', function() {
    cases.forEach(function(testcase) {
      expand(testcase);
    });
  });
});
