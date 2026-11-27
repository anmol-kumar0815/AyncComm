// Vercel (and anyone outside your network) can only reach the public npm registry. If `npm install` runs
// against a private mirror it writes that mirror's URLs into package-lock.json and CI fails to install
// ("getaddrinfo ENOTFOUND npm.apple.com"). Keep the lockfile on registry.npmjs.org.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('package-lock.json', () => {
  it('only references the public npm registry', () => {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
    const offenders = Object.entries(lock.packages)
      .filter(([, p]) => p.resolved && !p.resolved.startsWith('https://registry.npmjs.org/'))
      .map(([name, p]) => `${name} -> ${p.resolved}`)
    expect(offenders, 'run: sed -i "" "s#https://<private-host>/#https://registry.npmjs.org/#g" package-lock.json').toEqual([])
  })
})
