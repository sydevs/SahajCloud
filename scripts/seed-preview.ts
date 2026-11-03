#!/usr/bin/env node
/**
 * Fill a Railway PR preview with example submissions: `pnpm seed preview`,
 * signed in as the preview's own admin.
 *
 * A preview boots with one row — its admin, provisioned from
 * `PREVIEW_ADMIN_EMAIL` (`src/plugins/previewAdmin`) — and that address is also
 * the way in: `request-magic-link` answers it with a session instead of a mail.
 * So this needs the address and the PR number, and nothing else. It is
 * `previewUrl.seed` in `.claude/workflow.json`, which `/workflow:finalize-pr`
 * runs before it writes a PR's preview links.
 *
 * ⚠ **Previews only.** The host is built from the PR number, so it can never
 * name production, and the `preview` importer refuses production itself.
 *
 * Usage:
 *   PREVIEW_ADMIN_EMAIL=… pnpm tsx scripts/seed-preview.ts <pr-number> [seed flags]
 */
import { spawn } from 'node:child_process'

/** Kept in step with `previewUrl.pattern` in `.claude/workflow.json` by hand. */
const previewHost = (pr: number) => `https://sahajcloud-sahajcloud-pr-${pr}.up.railway.app`

const USAGE =
  'Usage: PREVIEW_ADMIN_EMAIL=… pnpm tsx scripts/seed-preview.ts <pr-number> [--dry-run]'

const say = (message: string): void => void process.stderr.write(`${message}\n`)

function fail(message: string): never {
  say(`✗ ${message}`)
  process.exit(1)
}

async function main(): Promise<void> {
  const [prArg, ...seedFlags] = process.argv.slice(2)
  const pr = Number(prArg)
  if (!Number.isInteger(pr) || pr <= 0) fail(USAGE)

  const email = process.env.PREVIEW_ADMIN_EMAIL?.trim()
  if (!email) fail(`PREVIEW_ADMIN_EMAIL is not set. ${USAGE}`)

  const origin = previewHost(pr)
  const response = await fetch(`${origin}/api/managers/request-magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!response.ok) fail(`${origin} refused the sign-in request (${response.status}).`)

  // Every other address gets `{ ok: true }` and no token, by design, so a
  // missing one means this preview does not hold this address as its admin.
  const { token } = (await response.json()) as { token?: string }
  if (!token) {
    fail(
      `${origin} signed nobody in. Its admin comes from the PREVIEW_ADMIN_EMAIL the deploy holds — ` +
        'check the boot log for a [previewAdmin] line, and that this shell holds the same value.',
    )
  }

  say(`→ pnpm seed preview ${seedFlags.join(' ')}  (against ${origin})\n`)
  const child = spawn('pnpm', ['seed', 'preview', ...seedFlags], {
    env: { ...process.env, ADMIN_TOKEN: token, SAHAJCLOUD_URL: origin },
    stdio: 'inherit',
  })
  child.on('error', (error) => fail(`Could not start pnpm seed: ${error.message}`))
  child.on('exit', (code) => process.exit(code ?? 1))
}

main().catch((error: unknown) => {
  if (!(error instanceof Error)) fail(String(error))
  const cause = error.cause instanceof Error ? ` (${error.cause.message})` : ''
  fail(`${error.message}${cause}`)
})
