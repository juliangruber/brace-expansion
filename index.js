var concatMap = require('concat-map');
var balanced = require('balanced-match');

module.exports = expandTop;

var escSlash = '\0SLASH'+Math.random()+'\0';
var escOpen = '\0OPEN'+Math.random()+'\0';
var escClose = '\0CLOSE'+Math.random()+'\0';
var escComma = '\0COMMA'+Math.random()+'\0';
var escPeriod = '\0PERIOD'+Math.random()+'\0';
var EXPANSION_MAX_LENGTH = 4000000;
var EXPANSION_RESULT_OVERHEAD = 24;

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


// Basically just str.split(","), but handling cases
// where we have nested braced sections, which should be
// treated as individual members, like {a,{b,c},d}
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

function expandTop(str, options) {
  if (!str)
    return [];

  options = options || {};
  var max = options.max == null ? Infinity : options.max;
  var maxLength = options.maxLength == null
    ? EXPANSION_MAX_LENGTH
    : Number(options.maxLength);
  if (maxLength !== maxLength) maxLength = EXPANSION_MAX_LENGTH;

  // I don't know why Bash 4.3 does this, but it does.
  // Anything starting with {} will have the first two bytes preserved
  // but *only* at the top level, so {},a}b will not expand to anything,
  // but a{},b}c will be expanded to [a}c,abc].
  // One could argue that this is a bug in Bash, but since the goal of
  // this module is to match Bash's rules, we escape a leading {}
  if (str.substr(0, 2) === '{}') {
    str = '\\{\\}' + str.substr(2);
  }

  return expand(escapeBraces(str), max, maxLength, true).map(unescapeBraces);
}

function identity(e) {
  return e;
}

function embrace(str) {
  return '{' + str + '}';
}
function isPadded(el) {
  return /^-?0\d/.test(el);
}

function lte(i, y) {
  return i <= y;
}
function gte(i, y) {
  return i >= y;
}

// `maxLength` primarily bounds characters, but every retained result also
// consumes an array slot and string metadata. Reserve a conservative minimum
// cost per result so duplicate empty strings cannot bypass the memory bound.
function resultLimit(maxLength) {
  if (maxLength === Infinity) return Infinity;
  if (maxLength <= 0) return 0;
  return Math.max(1, Math.floor(maxLength / EXPANSION_RESULT_OVERHEAD));
}

function appendValue(
  out,
  retained,
  value,
  pre,
  post,
  max,
  maxLength,
  dropEmpties
) {
  var countLimit = resultLimit(maxLength);
  if (!(out.length < max) || out.length >= countLimit) return false;

  for (var k = 0; k < post.length; k++) {
    if (!(out.length < max) || out.length >= countLimit) return false;
    var expansion = pre + value + post[k];
    if (dropEmpties && !expansion) continue;
    if (retained.length + expansion.length > maxLength) return false;
    out.push(expansion);
    retained.length += expansion.length;
  }
  return true;
}

function combineValues(values, pre, post, max, maxLength, dropEmpties) {
  var out = [];
  var retained = { length: 0 };
  for (var j = 0; j < values.length; j++) {
    if (!appendValue(
      out,
      retained,
      values[j],
      pre,
      post,
      max,
      maxLength,
      dropEmpties
    )) break;
  }
  return out;
}

function combineSingle(pre, post, maxLength) {
  return combineValues([''], pre, post, Infinity, maxLength, false);
}

function combineSequence(
  body,
  isAlphaSequence,
  pre,
  post,
  max,
  maxLength,
  dropEmpties
) {
  if (!post.length) return [];

  var n = body.split(/\.\./);
  var out = [];
  var retained = { length: 0 };
  var x = numeric(n[0]);
  var y = numeric(n[1]);
  var width = Math.max(n[0].length, n[1].length)
  var incr = n.length == 3
    ? Math.max(Math.abs(numeric(n[2])), 1)
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
    if (!appendValue(
      out,
      retained,
      c,
      pre,
      post,
      max,
      maxLength,
      dropEmpties
    )) break;
  }
  return out;
}

function combineOptions(
  body,
  pre,
  post,
  max,
  maxLength,
  dropEmpties
) {
  if (!post.length) return [];

  var n = parseCommaParts(body);
  if (n.length === 1) {
    // x{{a,b}}y ==> x{a}y x{b}y
    n = expand(n[0], max, maxLength, false).map(embrace);
    if (n.length === 1) {
      return combineSingle(pre + n[0], post, maxLength);
    }
  }

  var out = [];
  var retained = { length: 0 };
  for (var j = 0; j < n.length; j++) {
    var additions = expand(n[j], max, maxLength, false);
    for (var a = 0; a < additions.length; a++) {
      if (!appendValue(
        out,
        retained,
        additions[a],
        pre,
        post,
        max,
        maxLength,
        dropEmpties
      )) return out;
    }
  }
  return out;
}

function expand(str, max, maxLength, isTop) {
  var frames = [];
  var result;

  // Parse the recursive tail into explicit frames, then fold it right to left.
  for (;;) {
    var m = balanced('{', '}', str);
    if (!m) {
      result = [str];
      break;
    }

    var pre = m.pre;

    // Preserve the v1 behavior: once a `${...}` group is encountered, the
    // entire remaining tail is literal.
    if (/\$$/.test(pre)) {
      result = [str];
      break;
    }

    var isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body);
    var isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(m.body);
    var isSequence = isNumericSequence || isAlphaSequence;
    var isOptions = m.body.indexOf(',') >= 0;
    if (!isSequence && !isOptions) {
      // {a},b}
      if (m.post.match(/,(?!,).*\}/)) {
        str = m.pre + '{' + m.body + escClose + m.post;
        isTop = true;
        continue;
      }
      result = [str];
      break;
    }

    frames.push({
      type: 'regular',
      pre: pre,
      body: m.body,
      isAlphaSequence: isAlphaSequence,
      isSequence: isSequence,
      dropEmpties: isTop && !isSequence
    });
    if (m.post.length) {
      str = m.post;
      isTop = false;
      continue;
    }
    result = [''];
    break;
  }

  while (frames.length) {
    var frame = frames.pop();
    result = frame.isSequence
      ? combineSequence(
          frame.body,
          frame.isAlphaSequence,
          frame.pre,
          result,
          max,
          maxLength,
          frame.dropEmpties
        )
      : combineOptions(
          frame.body,
          frame.pre,
          result,
          max,
          maxLength,
          frame.dropEmpties
        );
  }

  return result;
}
