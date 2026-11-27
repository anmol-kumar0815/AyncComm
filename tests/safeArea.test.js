// pt-safe / pb-safe set the whole padding on that side; combining them with pt-*/pb-*/py-*/p-*
// silently drops the normal padding on desktop (the composer once sat flush against the window edge).
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.jsx') ? [p] : []
})

describe('safe-area utilities', () => {
  it('are never mixed with a plain padding utility for the same side', () => {
    const bad = []
    for (const file of walk('src')) {
      for (const [, cls] of readFileSync(file, 'utf8').matchAll(/className="([^"]*)"/g)) {
        const tokens = cls.split(/\s+/)
        if (tokens.includes('pb-safe') && tokens.some((t) => /^(p|py|pb)-\d/.test(t))) bad.push(`${file}: ${cls}`)
        if (tokens.includes('pt-safe') && tokens.some((t) => /^(p|py|pt)-\d/.test(t))) bad.push(`${file}: ${cls}`)
      }
    }
    expect(bad).toEqual([])
  })
})
