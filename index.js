module.exports = expand;

function expand(str) {
  var ret = expandBraces(str);

  for (var i = ret.length - 1; i >= 0; i--) {
    ret.splice.apply(ret, [i, 1].concat(expandRanges(ret[i])));
  }
  return ret;
}

function expandBraces(str) {
  var expansions = [];
  var m = /{[^}]*}/g.exec(str);
  if (!m) return [str];

  var pre = expandBraces(m.input.substr(0, m.index));
  var n = m[0].substr(1, m[0].length - 2).split(',');
  var post = expandBraces(m.input.slice(m.index + m[0].length));

  for (var i = 0; i < pre.length; i++) {
    for (var j = 0; j < n.length; j++) {
      for (var k = 0; k < post.length; k++) {
        expansions.push([pre[i], n[j], post[k]].join(''))
      }
    }
  }

  return expansions;
}

function number(str) {
  return parseInt(str, 10) == str
    ? parseInt(str, 10)
    : str.charCodeAt(0);
}

function expandRanges(str) {
  var expansions = [];
  var m = /\[[^\]]*\]/g.exec(str);
  if (!m) return [str];

  var pre = expandRanges(m.input.substr(0, m.index));

  var n = m[0].substr(1, m[0].length - 2).split('-');
  var stringMode = /[a-z]/i.test(n[0]);
  var start = number(n[0]);
  var end = /\:/.test(n[1])
    ? number(n[1].split(':')[0])
    : number(n[1]);
  var step = /\:/.test(n[1])
    ? number(n[1].split(':')[1])
    : 1;

  var N = [];
  function push(i) {
    if (stringMode) N.push(String.fromCharCode(i))
    else N.push(i);
  }

  for (var i = start; i <= end; i += step) push(i);
  if (end - start % 2) push(end);

  var post = expandRanges(m.input.slice(m.index + m[0].length));

  for (var i = 0; i < pre.length; i++) {
    for (var j = 0; j < N.length; j++) {
      for (var k = 0; k < post.length; k++) {
        expansions.push([pre[i], N[j], post[k]].join(''))
      }
    }
  }

  return expansions;
}

