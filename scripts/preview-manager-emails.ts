/**
 * Operator script: send the manager-facing AUTH emails — the invitation
 * (`InviteEmail`, #839) and the sign-in link (`SignInLinkEmail`, #837) — to a
 * Mailpit capture inbox, for visual review. Prints a direct preview link per
 * scenario.
 *
 * Usage:
 *   pnpm tsx scripts/preview-manager-emails.ts
 *
 * No database is touched. The four existing `preview-*-emails` scripts cover
 * registrant and event mail; none renders a manager auth email.
 *
 * ⚠ **It drives the real generators, not the templates.** `inviteVerification`
 * is the same object `Managers.auth.verify` installs, so the subject, the URL
 * shape and the grant rows are exactly what a create sends. The `payload` stub
 * covers the two calls that path makes — the `locale: 'all'` roles read, and
 * `secret` — so nothing here is reimplemented and the preview cannot drift.
 */

import type { Payload, PayloadRequest } from 'payload'

import dotenv from 'dotenv'

import { createCaptureTransport } from './mailpit-transport'

// Shell env wins, then .env.local, then .env (see seeds/env.ts).
dotenv.config({ path: ['.env.local', '.env'] })

// Absolute icon URLs must resolve for the reviewer. Default to production,
// since the Mailpit viewer cannot reach a localhost URL.
process.env.SAHAJCLOUD_URL ||= 'https://cloud.sydevelopers.com'

const SECRET = 'preview-only-secret'

interface Scenario {
  label: string
  note: string
  /** What a `locale: 'all'` read of `roles` returns for this manager. */
  roles: Record<string, string[]>
  type: string
  name: string
}

const SCENARIOS: Scenario[] = [
  {
    label: 'invite · one locale',
    note: 'the common case — a manager created with roles at the locale the admin was in',
    roles: { en: ['meditations-editor', 'path-editor'] },
    type: 'manager',
    name: 'Jo Smith',
  },
  {
    label: 'invite · several locales',
    note: 'what a RESEND can name: locales ranked by role count, ties on locale order',
    roles: { en: ['path-editor'], fr: ['web-translator', 'atlas-manager'], cs: ['web-translator'] },
    type: 'manager',
    name: 'Amélie Rousseau',
  },
  {
    label: 'invite · admin',
    note: 'no role list applies — an admin holds everything, in every locale',
    roles: {},
    type: 'admin',
    name: 'Sam Patel',
  },
  {
    label: 'invite · no roles yet',
    note: 'created with nothing assigned — says so outright rather than showing a blank table',
    roles: {},
    type: 'manager',
    name: 'Ravi Menon',
  },
]

async function main() {
  const { managersLogin } = await import('@/collections/Managers/login')
  const { generateEmailHTML, generateEmailSubject } = await import('@/plugins/login/mail')
  const { inviteVerification } = await import('@/plugins/login')
  const { SIGNIN_VALID_FOR } = await import('@/plugins/login')

  const { transport, messageUrl } = createCaptureTransport()
  const previews: { label: string; note: string; url: false | string }[] = []

  const send = async (scenario: { label: string; note: string }, subject: string, html: string) => {
    const info = await transport.sendMail({
      from: 'SahajCloud preview <dev@wemeditate.com>',
      to: 'manager-preview@example.com',
      // Label the inbox row so scenarios are distinguishable at a glance. The
      // real subject still appears inside the message.
      subject: `[${scenario.label}] ${subject}`,
      html,
    })
    previews.push({ label: scenario.label, note: scenario.note, url: messageUrl(info) })
  }

  const verify = inviteVerification(managersLogin)

  for (const scenario of SCENARIOS) {
    // The two calls `generateEmailHTML` makes: the roles read, and `secret`.
    const payload = {
      secret: SECRET,
      findByID: async () => ({ roles: scenario.roles }),
    } as unknown as Payload

    const user = { id: 42, email: 'manager-preview@example.com', name: scenario.name, type: scenario.type }
    const args = { req: { payload } as unknown as PayloadRequest, token: 'unused', user }

    await send(
      scenario,
      await verify.generateEmailSubject!(args as never),
      await verify.generateEmailHTML!(args as never),
    )
  }

  // The sibling an accepted manager gets instead, so the two can be compared.
  const signInArgs = {
    doc: { id: 42, email: 'manager-preview@example.com', name: 'Jo Smith' },
    project: undefined,
    signInUrl: `${process.env.SAHAJCLOUD_URL}${managersLogin.requestPagePath}?token=PREVIEW-TOKEN`,
    validFor: SIGNIN_VALID_FOR,
  }
  await send(
    { label: 'sign-in link', note: 'what an ACCEPTED manager gets when they ask for a link' },
    generateEmailSubject(signInArgs),
    await generateEmailHTML(signInArgs),
  )

  console.log('\n━━━ Manager auth email previews ━━━\n')
  console.log('Source: in-memory fixtures')
  console.log(`\nMailpit inbox (all messages): ${process.env.MAILPIT_URL ?? '(set MAILPIT_URL)'}`)
  console.log('  credentials: MAILPIT_UI_AUTH in .env.claude.local — messages kept 7 days')
  console.log(`\nIcons and links resolve against: ${process.env.SAHAJCLOUD_URL}`)
  console.log(`\nDirect preview links:\n`)
  for (const { label, note, url } of previews) {
    console.log(`  ${label}`)
    console.log(`    ${url}`)
    console.log(`    ${note}\n`)
  }

  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
