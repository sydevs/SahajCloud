#!/usr/bin/env node
// Seeds the preview Worker's admin by POSTing to Payload's /api/managers/first-register
// endpoint after a reclone has emptied the managers table. Using the HTTP endpoint
// (rather than a pre-computed pbkdf2 hash baked into SQL) keeps us insulated from
// changes to Payload's password-hashing algorithm.

import { argv, env, exit, stderr, stdout } from 'node:process'

const baseUrl = argv[2] ?? env.PREVIEW_URL

if (!baseUrl) {
  stderr.write('Usage: node scripts/seed-preview-admin.mjs <baseUrl>\n')
  exit(1)
}

const email = env.PREVIEW_ADMIN_EMAIL ?? 'contact@sydevelopers.com'
const password = env.PREVIEW_ADMIN_PASSWORD ?? 'evk1VTH5dxz_nhg-mzk'
const name = env.PREVIEW_ADMIN_NAME ?? 'Preview Admin'

const url = `${baseUrl.replace(/\/$/, '')}/api/managers/first-register`

const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, name, type: 'admin' }),
})

if (!res.ok) {
  stderr.write(`✗ first-register failed: HTTP ${res.status}\n`)
  stderr.write((await res.text()) + '\n')
  exit(1)
}

stdout.write(`✓ Seeded preview admin ${email} at ${url}\n`)
