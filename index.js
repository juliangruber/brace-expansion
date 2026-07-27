import balanced from 'balanced-match'

const escSlash = '\0SLASH' + Math.random() + '\0'
const escOpen = '\0OPEN' + Math.random() + '\0'
const escClose = '\0CLOSE' + Math.random() + '\0'
const escComma = '\0COMMA' + Math.random() + '\0'
const escPeriod = '\0PERIOD' + Math.random() + '\0'

/**
 * @return {number}
 */
function numeric (str) {
  return !isNaN(str)
    ? parseInt(str, 10)
    : str.charCodeAt(0)
}

/**
 * @param {string} str
 */
function escapeBraces (str) {
  return str.split('\\\\').join(escSlash)
    .split('\\{').join(escOpen)
    .split('\\}').join(escClose)
    .split('\\,').join(escComma)
    .split('\\.').join(escPeriod)
}

/**
 * @param {string} str
 */
function unescapeBraces (str) {
  return str.split(escSlash).join('\\')
    .split(escOpen).join('{')
    .split(escClose).join('}')
    .split(escComma).join(',')
    .split(escPeriod).join('.')
}

/**
 * Basically just str.split(","), but handling cases
 * where we have nested braced sections, which should be
 * treated as individual members, like {a,{b,c},d}
 * @param {string} str
 */
function parseCommaParts (str) {
  if (!str) { return [''] }

  const parts = []
  const m = balanced('{', '}', str)

  if (!m) { return str.split(',') }

  const { pre, body, post } = m
  const p = pre.split(',')

  p[p.length - 1] += '{' + body + '}'
  const postParts = parseCommaParts(post)
  if (post.length) {
    p[p.length - 1] += postParts.shift()
    p.push.apply(p, postParts)
  }

  parts.push.apply(parts, p)

  return parts
}

/**
 * @param {string} str
 * @param {{max?: number, maxLength?: number}} [options]
 */
export default function expandTop (str, options) {
  if (!str) { return [] }

  options = options || {}
  const max = options.max == null ? Infinity : options.max
  const maxLength = options.maxLength == null ? 4_000_000 : options.maxLength

  // I don't know why Bash 4.3 does this, but it does.
  // Anything starting with {} will have the first two bytes preserved
  // but *only* at the top level, so {},a}b will not expand to anything,
  // but a{},b}c will be expanded to [a}c,abc].
  // One could argue that this is a bug in Bash, but since the goal of
  // this module is to match Bash's rules, we escape a leading {}
  if (str.slice(0, 2) === '{}') {
    str = '\\{\\}' + str.slice(2)
  }

  return expand(escapeBraces(str), max, maxLength, true).map(unescapeBraces)
}

/**
 * @param {string} str
 */
function embrace (str) {
  return '{' + str + '}'
}

/**
 * @param {string} el
 */
function isPadded (el) {
  return /^-?0\d/.test(el)
}

/**
 * @param {number} i
 * @param {number} y
 */
function lte (i, y) {
  return i <= y
}

/**
 * @param {number} i
 * @param {number} y
 */
function gte (i, y) {
  return i >= y
}

/**
 * Build `{ acc[a] + pre + values[v] }` for every combination, capping the
 * number of results at `max` and the total number of characters at `maxLength`.
 * This is the one place output grows, so bounding it here keeps the single
 * accumulator - and therefore memory - flat regardless of how many brace groups
 * are combined (CVE-2026-14257).
 * @param {string[]} acc
 * @param {string} pre
 * @param {string[]} values
 * @param {number} max
 * @param {number} maxLength
 * @param {boolean} dropEmpties
 */
function combine (acc, pre, values, max, maxLength, dropEmpties) {
  const out = []
  let length = 0
  for (let a = 0; a < acc.length; a++) {
    for (let v = 0; v < values.length; v++) {
      if (out.length >= max) return out
      const expansion = acc[a] + pre + values[v]
      // Bash drops empty results at the top level. Skip them before they count
      // against `max`, so `max` bounds the number of *kept* results.
      if (dropEmpties && !expansion) continue
      if (length + expansion.length > maxLength) return out
      out.push(expansion)
      length += expansion.length
    }
  }
  return out
}

/**
 * The expansion values of a single numeric (`1..5`) or alphabetic (`a..e..2`)
 * sequence body.
 * @param {string} body
 * @param {boolean} isAlphaSequence
 * @param {number} max
 */
function expandSequence (body, isAlphaSequence, max) {
  const n = body.split(/\.\./)
  /** @type {string[]} */
  const N = []
  // A sequence body always splits into two or three parts, but the compiler
  // can't know that.
  /* c8 ignore start */
  if (n[0] === undefined || n[1] === undefined) {
    return N
  }
  /* c8 ignore stop */
  const x = numeric(n[0])
  const y = numeric(n[1])
  const width = Math.max(n[0].length, n[1].length)
  let incr = n.length === 3
    ? Math.max(Math.abs(numeric(n[2])), 1)
    : 1
  let test = lte
  const reverse = y < x
  if (reverse) {
    incr *= -1
    test = gte
  }
  const pad = n.some(isPadded)

  for (let i = x; test(i, y) && N.length < max; i += incr) {
    let c
    if (isAlphaSequence) {
      c = String.fromCharCode(i)
      if (c === '\\') { c = '' }
    } else {
      c = String(i)
      if (pad) {
        const need = width - c.length
        if (need > 0) {
          const z = new Array(need + 1).join('0')
          if (i < 0) { c = '-' + z + c.slice(1) } else { c = z + c }
        }
      }
    }
    N.push(c)
  }
  return N
}

/**
 * @param {string} str
 * @param {number} max
 * @param {number} maxLength
 * @param {boolean} [isTop]
 */
function expand (str, max, maxLength, isTop) {
  // Consume the string's top-level brace groups left to right, threading a
  // running set of combined prefixes (`acc`). Expanding the tail iteratively -
  // rather than recursing on `m.post` once per group - keeps the native stack
  // depth constant, so deeply chained input (`'{a,b}'.repeat(3000)`) can no
  // longer overflow the stack, and leaves a single accumulator whose size
  // `maxLength` bounds directly (CVE-2026-14257).
  let acc = ['']

  // Bash drops empty results, but only when the *first* top-level group is a
  // comma set - a sequence like `{a..\}` may legitimately yield ''. The drop
  // is on the final strings, so it is applied to whichever `combine` produces
  // them (the one with no brace set left in the tail).
  let dropEmpties = false
  let firstGroup = true

  for (;;) {
    const m = balanced('{', '}', str)

    // No brace set left: the rest of the string is literal.
    if (!m) {
      return combine(acc, str, [''], max, maxLength, dropEmpties)
    }

    // no need to expand pre, since it is guaranteed to be free of brace-sets
    const pre = m.pre

    if (/\$$/.test(pre)) {
      acc = combine(acc, pre + '{' + m.body + '}', [''], max, maxLength, dropEmpties && !m.post.length)
      firstGroup = false
      if (!m.post.length) break
      str = m.post
      continue
    }

    const isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body)
    const isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(m.body)
    const isSequence = isNumericSequence || isAlphaSequence
    const isOptions = m.body.indexOf(',') >= 0
    if (!isSequence && !isOptions) {
      // {a},b}
      if (m.post.match(/,(?!,).*\}/)) {
        str = pre + '{' + m.body + escClose + m.post
        isTop = true
        continue
      }
      // Nothing here expands, so the whole remaining string is literal.
      return combine(acc, pre + '{' + m.body + '}' + m.post, [''], max, maxLength, dropEmpties)
    }

    if (firstGroup) {
      dropEmpties = isTop && !isSequence
      firstGroup = false
    }

    let values
    if (isSequence) {
      values = expandSequence(m.body, isAlphaSequence, max)
    } else {
      let n = parseCommaParts(m.body)
      if (n.length === 1) {
        // x{{a,b}}y ==> x{a}y x{b}y
        n = expand(n[0], max, maxLength, false).map(embrace)
        if (n.length === 1) {
          acc = combine(acc, pre + n[0], [''], max, maxLength, dropEmpties && !m.post.length)
          if (!m.post.length) break
          str = m.post
          continue
        }
      }
      values = []
      for (let j = 0; j < n.length; j++) {
        values.push.apply(values, expand(n[j], max, maxLength, false))
      }
    }

    acc = combine(acc, pre, values, max, maxLength, dropEmpties && !m.post.length)
    if (!m.post.length) break
    str = m.post
  }

  return acc
}
