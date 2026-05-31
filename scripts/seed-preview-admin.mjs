#!/usr/bin/env node
// Seeds the preview Worker's admin by INSERTing a managers row directly into
// the preview D1, using Payload's exact pbkdf2-sha256 hashing parameters
// (25 000 iterations, 512-byte keylen, 32-byte hex salt — confirmed against
// node_modules/payload/dist/auth/strategies/local/generatePasswordSaltHash.js).
//
// Direct-SQL approach avoids depending on a running preview Worker (the
// reclone runs on a schedule and may execute before any preview deploy
// exists, or while no PR's preview alias is live).
//
// Usage: node scripts/seed-preview-admin.mjs [db-name] [wrangler-env]
// Defaults: db-name = "sahajcloud-preview", wrangler-env = "preview".
// Reads CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID from env (wrangler picks
// them up automatically when present).

import { spawnSync } from 'node:child_process'
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { argv, env, exit, stderr, stdout } from 'node:process'

const dbName = argv[2] ?? 'sahajcloud-preview'
const wranglerEnv = argv[3] ?? 'preview'

const email = env.PREVIEW_ADMIN_EMAIL ?? 'contact@sydevelopers.com'
const password = env.PREVIEW_ADMIN_PASSWORD ?? 'evk1VTH5dxz_nhg-mzk'
const name = env.PREVIEW_ADMIN_NAME ?? 'Preview Admin'

const salt = randomBytes(32).toString('hex')
const hash = pbkdf2Sync(password, salt, 25000, 512, 'sha256').toString('hex')

// Single-quote escape for SQL string literals (SQLite uses '' to escape ').
const q = (s) => s.replace(/'/g, "''")

const sql =
  `INSERT INTO managers (name, email, type, _verified, salt, hash) ` +
  `VALUES ('${q(name)}', '${q(email)}', 'admin', 1, '${salt}', '${hash}');`

const result = spawnSync(
  'pnpm',
  ['exec', 'wrangler', 'd1', 'execute', dbName, '--remote', '--env', wranglerEnv, '--command', sql],
  { stdio: ['ignore', 'pipe', 'inherit'] },
)

if (result.status !== 0) {
  stderr.write(`✗ Seed failed (wrangler exit ${result.status})\n`)
  exit(result.status ?? 1)
}

stdout.write(`✓ Seeded preview admin ${email} into ${dbName} (env=${wranglerEnv})\n`)
