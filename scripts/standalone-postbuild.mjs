#!/usr/bin/env node
// Postbuild step for `output: 'standalone'` (next.config.mjs).
//
// Next.js writes a minimal server to `.next/standalone/server.js`, but it
// does not copy the static assets that server needs. The standalone
// server resolves `.next/static` and `public/` relative to itself, so
// this script copies both next to `server.js`:
//   .next/static  ->  .next/standalone/.next/static
//   public/       ->  .next/standalone/public
//
// Runs as part of `pnpm build`, both locally and on Railpack. See issue
// #471.

import { cpSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const standaloneDir = join(root, '.next', 'standalone')

if (!existsSync(standaloneDir)) {
  console.error(
    "[standalone-postbuild] .next/standalone not found. Did `next build` run with `output: 'standalone'` in next.config.mjs?",
  )
  process.exit(1)
}

// `public/` is optional in Next.js. `.next/static` always exists after a build.
const copies = [
  [join(root, '.next', 'static'), join(standaloneDir, '.next', 'static')],
  [join(root, 'public'), join(standaloneDir, 'public')],
]

for (const [src, dest] of copies) {
  if (!existsSync(src)) {
    console.log(`[standalone-postbuild] skip (absent): ${src}`)
    continue
  }
  cpSync(src, dest, { recursive: true })
  console.log(`[standalone-postbuild] copied ${src} -> ${dest}`)
}

console.log('[standalone-postbuild] done')
