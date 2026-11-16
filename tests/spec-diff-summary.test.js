import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { diffPointers, formatDiffSummary } from '../scripts/lib/spec-diff.mjs'

describe('spec diff summary', () => {
  it('names each differing pointer once, in sorted order, and never a value', () => {
    const before = {
      info: { title: 'Secret title' },
      paths: { '/a': { get: { description: 'old text' } }, '/gone': { get: {} } },
      tags: [{ name: 'x' }],
    }
    const after = {
      info: { title: 'Secret title' },
      paths: { '/a': { get: { description: 'new text' } }, '/new/{id}': { get: { summary: 's' } } },
      tags: [{ name: 'x' }, { name: 'added value' }],
    }
    const result = diffPointers(before, after)
    expect(result).toEqual({
      total: 4,
      entries: [
        { kind: 'changed', pointer: '/paths/~1a/get/description' },
        { kind: 'removed', pointer: '/paths/~1gone' },
        { kind: 'added', pointer: '/paths/~1new~1{id}' },
        { kind: 'added', pointer: '/tags/1' },
      ],
    })
    const text = formatDiffSummary(result)
    for (const value of ['old text', 'new text', 'Secret title', 'added value']) {
      expect(text).not.toContain(value)
    }
  })

  it('reports a value that changes type, and identical documents', () => {
    expect(diffPointers({ a: 1 }, { a: { b: 1 } }).entries).toEqual([
      { kind: 'changed', pointer: '/a' },
    ])
    expect(diffPointers({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual({
      total: 0,
      entries: [],
    })
    expect(formatDiffSummary(diffPointers({ a: 1 }, { a: 1 }))).toBe('The documents are identical.')
  })

  it('lists at most the limit and still counts all of them', () => {
    const before = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`k${i}`, 0]))
    const after = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`k${i}`, 1]))
    const result = diffPointers(before, after)
    expect(result.total).toBe(300)
    expect(result.entries).toHaveLength(200)
    expect(formatDiffSummary(result).split('\n')[0]).toBe('300 differences, the first 200 of them:')
    expect(formatDiffSummary(result).split('\n')).toHaveLength(201)
  })

  it('prints the summary from the command line', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-diff-'))
    try {
      const before = path.join(dir, 'before.json')
      const after = path.join(dir, 'after.json')
      fs.writeFileSync(before, JSON.stringify({ a: { description: 'one' } }))
      fs.writeFileSync(after, JSON.stringify({ a: { description: 'two' } }))
      const script = new URL('../scripts/spec-diff-summary.mjs', import.meta.url).pathname
      const output = execFileSync(process.execPath, [script, before, after], { encoding: 'utf-8' })
      expect(output).toBe('1 difference:\nchanged /a/description\n')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
