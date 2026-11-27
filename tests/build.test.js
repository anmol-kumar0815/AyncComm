// Guards a promise we make in the docs: the dev auto-login (and its seeded
// credentials) must never ship in a production bundle.
//
// Runs the real `vite build` in a child process: calling build() inside Vitest
// inherits NODE_ENV=test, which makes Vite treat the build as non-production.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const NEEDLES = ['password123', 'dev_user@example.com', 'alice@example.com', 'asynccomm.devAutoLogin']

function bundle(mode) {
  const out = mkdtempSync(path.join(tmpdir(), 'asynccomm-build-'))
  try {
    execFileSync('npx', ['vite', 'build', '--mode', mode, '--outDir', out, '--emptyOutDir', '--logLevel', 'silent'], {
      env: { ...process.env, NODE_ENV: mode === 'production' ? 'production' : 'development' },
      stdio: 'pipe',
    })
    const dir = path.join(out, 'assets')
    return readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(path.join(dir, f), 'utf8')).join('\n')
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}

describe('dev auto-login is development-only', () => {
  it('is absent from the production bundle', () => {
    const code = bundle('production')
    expect(code.length).toBeGreaterThan(10_000) // sanity: we really bundled the app
    for (const needle of NEEDLES) expect(code, `"${needle}" leaked into the production bundle`).not.toContain(needle)
  }, 60_000)

  it('is present in a development bundle (so the check above can actually fail)', () => {
    const code = bundle('development')
    expect(code).toContain('password123')
  }, 60_000)
})
