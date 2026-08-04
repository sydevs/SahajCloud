import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import dotenv from 'dotenv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Guards how the CLI-side entry points load `.env` files.
 *
 * Seeding a remote target takes its admin credentials from the shell:
 *
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… pnpm seed:prod atlas
 *
 * That only works while the loaders leave an already-set variable alone. The
 * original pair — `dotenv.config({ path: '.env' })` followed by
 * `dotenv.config({ path: '.env.local', override: true })` — did not: the blank
 * `ADMIN_PASSWORD=` that local dev keeps in `.env.local` overwrote the value
 * passed on the command line, and `seeds/env.ts` then rejected it as missing.
 *
 * Two assertions below, because either one alone can pass vacuously: the first
 * pins dotenv's own precedence semantics (an upgrade could change them), the
 * second pins that every call site actually asks for those semantics.
 */

const REPO_ROOT = path.resolve(__dirname, '../..')

describe('env-file precedence', () => {
  let fixtureDir: string
  let envPath: string
  let envLocalPath: string

  beforeAll(() => {
    fixtureDir = mkdtempSync(path.join(tmpdir(), 'env-precedence-'))
    envPath = path.join(fixtureDir, '.env')
    envLocalPath = path.join(fixtureDir, '.env.local')

    // `BLANK_IN_LOCAL` reproduces the ADMIN_PASSWORD shape exactly: a real value
    // in the shell, an empty assignment in .env.local.
    writeFileSync(envPath, 'SHARED=from_env\nONLY_IN_ENV=env_value\n')
    writeFileSync(
      envLocalPath,
      'SHARED=from_env_local\nONLY_IN_LOCAL=local_value\nBLANK_IN_LOCAL=\n',
    )
  })

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true })
  })

  /** Load the fixtures the way the source does, into a throwaway env object. */
  function load(shellEnv: Record<string, string>): Record<string, string> {
    const processEnv = { ...shellEnv }
    dotenv.config({ path: [envLocalPath, envPath], processEnv })
    return processEnv
  }

  it('lets the shell win over both files', () => {
    const env = load({ SHARED: 'from_shell', BLANK_IN_LOCAL: 'prod-password' })

    expect(env.SHARED).toBe('from_shell')
    // The regression: a blank assignment in .env.local must not erase this.
    expect(env.BLANK_IN_LOCAL).toBe('prod-password')
  })

  it('lets .env.local win over .env when the shell is silent', () => {
    const env = load({})

    expect(env.SHARED).toBe('from_env_local')
    expect(env.BLANK_IN_LOCAL).toBe('')
  })

  it('still loads keys that only .env defines', () => {
    const env = load({})

    expect(env.ONLY_IN_ENV).toBe('env_value')
    expect(env.ONLY_IN_LOCAL).toBe('local_value')
  })

  it('has no call site that overrides an already-set variable', () => {
    const callSites = findDotenvCallSites()

    // Sanity: the scan itself must not silently find nothing.
    expect(callSites.length).toBeGreaterThanOrEqual(7)

    for (const { file, line } of callSites) {
      expect(line, `${file} must not pass override: true`).not.toContain('override')
      expect(line, `${file} must load .env.local ahead of .env`).toContain(
        "path: ['.env.local', '.env']",
      )
    }
  })
})

/** Every `dotenv.config(...)` line under the CLI-side directories. */
function findDotenvCallSites(): { file: string; line: string }[] {
  const results: { file: string; line: string }[] = []

  for (const dir of ['seeds', 'scripts', 'src']) {
    for (const file of walkTypeScript(path.join(REPO_ROOT, dir))) {
      for (const line of readFileSync(file, 'utf-8').split('\n')) {
        if (line.includes('dotenv.config(')) {
          results.push({ file: path.relative(REPO_ROOT, file), line })
        }
      }
    }
  }

  return results
}

function walkTypeScript(dir: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'cache') continue

    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkTypeScript(full))
    } else if (entry.name.endsWith('.ts')) {
      files.push(full)
    }
  }

  return files
}
