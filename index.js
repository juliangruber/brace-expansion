var concatMap = require('concat-map');
var balanced = require('balanced-match');

module.exports = expandTop;

var escSlash = '\0SLASH'+Math.random()+'\0';
var escOpen = '\0OPEN'+Math.random()+'\0';
var escClose = '\0CLOSE'+Math.random()+'\0';
var escComma = '\0COMMA'+Math.random()+'\0';
var escPeriod = '\0PERIOD'+Math.random()+'\0';

function numeric(str) {
  return parseInt(str, 10) == str
    ? parseInt(str, 10)
    : str.charCodeAt(0);
}

function escapeBraces(str) {
  return str.split('\\\\').join(escSlash)
            .split('\\{').join(escOpen)
            .split('\\}').join(escClose)
            .split('\\,').join(escComma)
            .split('\\.').join(escPeriod);
}

function unescapeBraces(str) {
  return str.split(escSlash).join('\\')
            .split(escOpen).join('{')
            .split(escClose).join('}')
            .split(escComma).join(',')
            .split(escPeriod).join('.');
}

// cache regex
var rDigit = /^-?0\d/;
var rNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/;
var rAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/
var raCloseB = /,.*\}/;

// Basically just str.split(","), but handling cases
// where we have nested braced sections, which should be
// treated as individual members, like {a,{b,c},d}
// this just split on ',' but not the `,` in {}
function parseCommaParts(str) {
  if (!str)
    return [''];

  var parts = [];
  var m = balanced('{', '}', str);

  if (!m)
    return str.split(',');

  var pre = m.pre;
  var body = m.body;
  var post = m.post;
  var p = pre.split(',');

  p[p.length-1] += '{' + body + '}';
  var postParts = parseCommaParts(post);
  if (post.length) {
    p[p.length-1] += postParts.shift();
    p.push.apply(p, postParts);
  }

  parts.push.apply(parts, p);

  return parts;
}

function expandTop(str) {
  if (!str)
    return [];

  // I don't know why Bash 4.3 does this, but it does.
  // Anything starting with {} will have the first two bytes preserved
  // but *only* at the top level, so {},a}b will not expand to anything,
  // but a{},b}c will be expanded to [a}c,abc].
  // One could argue that this is a bug in Bash, but since the goal of
  // this module is to match Bash's rules, we escape a leading {}
  if (str.substr(0, 2) === '{}') {
    str = '\\{\\}' + str.substr(2);
  }

  return expand(escapeBraces(str)).map(unescapeBraces);
}

function identity(e) {
  return e;
}

function embrace(str) {
  return '{' + str + '}';
}
function isPadded(el) {
  return rDigit.test(el);
}

function lte(i, y) {
  return i <= y;
}
function gte(i, y) {
  return i >= y;
}

function expand(str) {
  var expansions = [];

  var m = balanced('{', '}', str);

  // ${a,b} doesn't expand
  if (!m || (m.pre && m.pre.indexOf('$') === m.pre.length - 1)) return [str];

  // no need to expand pre, since it is guaranteed to be free of brace-sets
  var pre = m.pre;

  var isNumericSequence = rNumericSequence.test(m.body);
  var isAlphaSequence = rAlphaSequence.test(m.body);
  var isSequence = isNumericSequence || isAlphaSequence;
  var isOptions = m.body.indexOf(',') >= 0;
  if (!isSequence && !isOptions) {
    // {a},b}
    if (m.post.match(raCloseB)) {
      // todo: this can probably be optimised if we slightly change the behaviour of `balanced-match`
      // we want m.body to be `a},b` :)
      str = pre + '{' + m.body + escClose + m.post;
      // escaped the correct } and try again
      return expand(str);
    }
    // "plain" string
    return [str];
  }

  var post = m.post.length
    ? expand(m.post)
    : [''];

  // n is options or sequence parts. EG: ['opt1', 'opt2'] or ['1', '3']
  // N is the final parts after m.post is expanded and/or all options are expanded.
  // EG: ['1', '2', '3'] if sequence
  var n;
  var N = [];

  if (isOptions) {
    n = parseCommaParts(m.body);
    if (n.length === 1) {
      // x{{a,b}}y ==> x{a}y x{b}y
      n = expand(n[0]).map(embrace);
      if (n.length === 1) {
        return post.map(function(p) {
          return pre + n[0] + p;
        });
      }
    }

    N = concatMap(n, function(el) { return expand(el) });
  } else {
    // isSequence is true
    n = m.body.split('..');

    var x = numeric(n[0]);
    var y = numeric(n[1]);
    var incr = n.length == 3
      ? Math.abs(numeric(n[2]))
      : 1;
    var test = lte;
    var reverse = y < x;
    if (reverse) {
      incr *= -1;
      test = gte;
    }
    var pad = n.some(isPadded);

    for (var i = x; test(i, y); i += incr) {
      var c;
      if (isAlphaSequence) {
        c = String.fromCharCode(i);
        if (c === '\\')
          c = '';
      } else {
        // todo: is Math.abs() faster?
        c = String(i);
        if (pad) {
          var width = Math.max(n[0].length, n[1].length)
          var need = width - c.length;
          if (need > 0) {
            var z = new Array(need + 1).join('0');
            if (i < 0)
              c = '-' + z + c.slice(1);
            else
              c = z + c;
          }
        }
      }
      N.push(c);
    }
  }

  for (var j = 0; j < N.length; j++) {
    for (var k = 0; k < post.length; k++) {
      var expansion = pre + N[j] + post[k];
      if (isSequence || expansion)
        expansions.push(expansion);
    }
  }

  return expansions;
}
