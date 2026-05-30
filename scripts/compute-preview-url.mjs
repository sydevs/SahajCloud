#!/usr/bin/env node
// Computes the deterministic Cloudflare Workers Builds preview alias for a branch.
// Mirrors CF's branch-alias slug rules: lowercase, non-alphanumeric runs collapse
// to a single dash, trim leading/trailing dashes, truncate to fit the DNS label cap.
//
// Inputs (env preferred over argv so it composes with GitHub Actions):
//   GITHUB_HEAD_REF or argv[2]   — the source branch (e.g. "feat/foo-bar")
//   CF_WORKER_SUBDOMAIN          — the account subdomain (e.g. "contact-c66")
//   CF_WORKER_NAME               — defaults to "sahajcloud-preview"
// Output: prints the URL to stdout.

import { argv, env, exit, stderr, stdout } from 'node:process'

const branch = env.GITHUB_HEAD_REF || argv[2]
const subdomain = env.CF_WORKER_SUBDOMAIN
const workerName = env.CF_WORKER_NAME || 'sahajcloud-preview'

if (!branch || !subdomain) {
  stderr.write(
    'Usage: GITHUB_HEAD_REF=<branch> CF_WORKER_SUBDOMAIN=<sub> node scripts/compute-preview-url.mjs [branch]\n',
  )
  exit(1)
}

const slug = branch
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

const label = `${slug}-${workerName}`.slice(0, 63).replace(/-+$/, '')

stdout.write(`https://${label}.${subdomain}.workers.dev\n`)
