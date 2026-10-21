#!/usr/bin/env node
/**
 * Redeem a sign-in link for a session token — printed, or handed straight to a
 * seed run.
 *
 * A remote seed run needs a manager's session token, and a manager has no
 * password (#840). The token used to come from signing in with a browser and
 * copying the `payload-token` cookie out of devtools. This sends the same
 * `POST` the sign-in page's button sends (`src/plugins/login/endpoints/redeem.ts`)
 * and reads the cookie off the redirect instead.
 *
 * It grants nothing the link does not: the route is the public one the sign-in
 * page posts to, and the link is the credential.
 *
 * ⚠ **It spends the link.** A sign-in link works once, so the one redeemed here
 * cannot also sign a browser in.
 *
 * ⚠ **Nothing is written to disk.** The session expires within hours, so a
 * saved copy goes stale and is read later as a credential that no longer
 * works. With `--seed`, everything after it goes to `pnpm seed`, which gets
 * `ADMIN_TOKEN` and `SAHAJCLOUD_URL` from the link in its own environment —
 * the token is never printed, and the target is always the server the token is
 * valid on. Without it, the token goes to stdout for
 * `export ADMIN_TOKEN=$(…)`. Everything else goes to stderr.
 *
 * `--seed` runs `pnpm seed` and nothing else, so a permission rule for this
 * script's prefix cannot be used to run an arbitrary command.
 *
 * Usage (quote the link: zsh reads `?` as a glob):
 *   pnpm -s tsx scripts/redeem-signin-link.ts '<sign-in link>'
 *   pnpm tsx scripts/redeem-signin-link.ts '<sign-in link>' --seed <script> [seed flags]
 */
import { spawn } from 'node:child_process'

import { describeRefusal, parseSignInLink, readJwtClaims, sessionTokenFrom } from './signin-token'

const USAGE =
  "Usage: pnpm tsx scripts/redeem-signin-link.ts '<sign-in link>' [--seed <script> [seed flags]]"

const say = (message: string): void => void process.stderr.write(`${message}\n`)

function fail(message: string): never {
  say(`✗ ${message}`)
  process.exit(1)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const seedAt = args.indexOf('--seed')
  const [link, ...rest] = seedAt === -1 ? args : args.slice(0, seedAt)
  const seedArgs = seedAt === -1 ? null : args.slice(seedAt + 1)
  if (!link || rest.length > 0 || seedArgs?.length === 0) fail(USAGE)

  const { collection, expiresAt, origin, token: linkToken } = parseSignInLink(link)
  if (expiresAt <= new Date()) {
    fail(`The link expired at ${expiresAt.toISOString()}. Request a new one at ${origin}/admin/login.`)
  }

  const redeemed = await fetch(
    `${origin}/api/${collection}/redeem?token=${encodeURIComponent(linkToken)}`,
    // ⚠ `manual` is load-bearing: following the 302 would drop the `Set-Cookie`
    // it carries, which is the whole answer.
    { method: 'POST', redirect: 'manual' },
  )
  const session = sessionTokenFrom(redeemed.headers.getSetCookie())
  if (!session) fail(describeRefusal(redeemed.status, redeemed.headers.get('location')))

  const me = await fetch(`${origin}/api/${collection}/me`, {
    // Without `DisableAutologin`, a dev server answers /me with its auto-login
    // admin whatever the token, and a broken session would read as working.
    headers: { Authorization: `JWT ${session}`, DisableAutologin: 'true' },
  })
  const { user } = (await me.json()) as { user?: { email?: string; type?: string } | null }
  if (!user) fail(`${origin} issued a session that its own /me does not recognise.`)

  const { exp } = readJwtClaims(session)
  const until = typeof exp === 'number' ? new Date(exp * 1000).toISOString() : 'unknown'
  say(`✓ Signed in to ${origin} as ${user.email} (${user.type ?? 'no type'}), until ${until}.`)
  // The seed route admits `type: 'admin'` and nothing else.
  if (user.type !== 'admin') say('⚠ Not an admin: the seed route will answer 403.')

  if (!seedArgs) {
    process.stdout.write(`${session}\n`)
    return
  }

  say(`→ pnpm seed ${seedArgs.join(' ')}  (against ${origin})\n`)
  const child = spawn('pnpm', ['seed', ...seedArgs], {
    // `seeds/env.ts` ranks the process environment above `.env.local`, so a
    // stale file can neither replace this token nor aim it at another server.
    env: { ...process.env, ADMIN_TOKEN: session, SAHAJCLOUD_URL: origin },
    stdio: 'inherit',
  })
  child.on('error', (error) => fail(`Could not start pnpm seed: ${error.message}`))
  child.on('exit', (code) => process.exit(code ?? 1))
}

main().catch((error: unknown) => {
  if (!(error instanceof Error)) fail(String(error))
  // `fetch failed` alone names no host or reason; undici puts both in `cause`.
  const cause = error.cause instanceof Error ? ` (${error.cause.message})` : ''
  fail(`${error.message}${cause}`)
})
