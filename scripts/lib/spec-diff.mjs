const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const escapeSegment = (segment) => String(segment).replace(/~/g, '~0').replace(/\//g, '~1')
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * The JSON pointers at which two documents differ, as `{ kind, pointer }` in
 * document order (object keys by code unit). `added` and `removed` name a key or
 * array index present on one side only, `changed` a value that differs. A subtree
 * that exists on one side only is one entry, not one per leaf. Values are never
 * part of the result, only the names that lead to them.
 *
 * `total` counts every difference; `entries` holds at most `limit` of them.
 */
export function diffPointers(before, after, limit = 200) {
  const entries = []
  let total = 0
  const record = (kind, pointer) => {
    total += 1
    if (entries.length < limit) entries.push({ kind, pointer })
  }

  function compare(a, b, pointer) {
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
        const child = `${pointer}/${index}`
        if (index >= a.length) record('added', child)
        else if (index >= b.length) record('removed', child)
        else compare(a[index], b[index], child)
      }
    } else if (isObject(a) && isObject(b)) {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(byCodeUnit)
      for (const key of keys) {
        const child = `${pointer}/${escapeSegment(key)}`
        if (!Object.hasOwn(a, key)) record('added', child)
        else if (!Object.hasOwn(b, key)) record('removed', child)
        else compare(a[key], b[key], child)
      }
    } else if (!Object.is(a, b)) {
      record('changed', pointer)
    }
  }

  compare(before, after, '')
  return { total, entries }
}

/** The text a run prints: one pointer per line, names only. */
export function formatDiffSummary({ total, entries }) {
  if (total === 0) return 'The documents are identical.'
  const lines = [
    total > entries.length
      ? `${total} differences, the first ${entries.length} of them:`
      : `${total} ${total === 1 ? 'difference' : 'differences'}:`,
    ...entries.map(({ kind, pointer }) => `${kind} ${pointer === '' ? '(document)' : pointer}`),
  ]
  return lines.join('\n')
}
