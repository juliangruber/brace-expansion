var concatMap = require('concat-map');
var balanced = require('balanced-match');

module.exports = expandTop;

function numeric(str) {
  return parseInt(str, 10) == str
    ? parseInt(str, 10)
    : str.charCodeAt(0);
}

function expandTop(str) {
  if (!str)
    return [];

  var expansions = expand(str);
  return expansions.filter(function(e) {
    return e;
  });
}

function expand(str) {
  var expansions = [];

  var m = balanced('{', '}', str);
  if (!m || /\$$/.test(m.pre)) return [str];

  var isNumericSequence = /^-?\d+\.\.-?\d+(\.\.-?\d+)?$/.test(m.body);
  var isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](\.\.-?\d+)?$/.test(m.body);
  var isSequence = isNumericSequence || isAlphaSequence;
  var isOptions = /^(.*,)+(.+)?$/.test(m.body);
  if (!isSequence && !isOptions) return [str];

  var pre = m.pre.length
    ? expand(m.pre)
    : [''];
  var post = m.post.length
    ? expand(m.post)
    : [''];

  var n = [];
  var bal = 0;
  var buf = '';
  var sep = isSequence
    ? /^\.\./
    : /^,/;
  var c, next;
  for (var i = 0; i < m.body.length; i++) {
    c = m.body[i];

    if (!bal && sep.test(m.body.slice(i))) {
      n.push(buf);
      buf = '';
    } else if (!(isSequence && c == '.')){
      buf += c;

      if (c == '{') {
        bal++;
      } else if (c == '}') {
        bal--;
      }
    }
    if (i == m.body.length - 1) {
      n.push(buf);
    }
  }

  n = concatMap(n, function(el) { return expand(el) });
  var N;

  if (isSequence) {
    var x = numeric(n[0]);
    var y = numeric(n[1]);
    var width = typeof x == 'number'
      ? Math.max(n[0].length, n[1].length)
      : 1;
    var incr = n.length == 3
      ? Math.abs(numeric(n[2]))
      : 1;
    var reverse = y < x;
    var pad = n.filter(function(el) {
      return /^-?0\d/.test(el);
    }).length;

    N = [];
    function push(i) {
      var c;
      if (isAlphaSequence) {
        c = String.fromCharCode(i);
        if (c === '\\')
          c = '';
      } else {
        c = String(i);
        if (pad) {
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

    if (reverse) {
      for (var i = x; i >= y; i -= incr) push(i);
    } else {
      for (var i = x; i <= y; i += incr) push(i);
    }
  } else {
    N = n;
  }

  for (var i = 0; i < pre.length; i++) {
    for (var j = 0; j < N.length; j++) {
      for (var k = 0; k < post.length; k++) {
        expansions.push([pre[i], N[j], post[k]].join(''))
      }
    }
  }

  return expansions;
}

