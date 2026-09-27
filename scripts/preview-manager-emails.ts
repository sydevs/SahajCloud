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
 * ⚠ **It drives the real generators, not the templates.** The create scenarios
 * go through `inviteVerification`, the object `Managers.auth.verify` installs;
 * the resend scenarios through `prepareInvite`, what `issueMagicLink` calls. So
 * the subject, the brand, the URL shape and every row are exactly what a real
 * send produces. The `payload` stub answers only the database reads — the
 * `locale: 'all'` roles read and the `find` per managed collection — and its
 * collection configs are the real ones, so the preview cannot drift.
 */

import type { CollectionConfig, Payload, PayloadRequest } from 'payload'

import dotenv from 'dotenv'
import { flattenAllFields } from 'payload'

import { createCaptureTransport } from './mailpit-transport'

// Shell env wins, then .env.local, then .env (see seeds/env.ts).
dotenv.config({ path: ['.env.local', '.env'] })

// Absolute icon URLs must resolve for the reviewer. Default to production,
// since the Mailpit viewer cannot reach a localhost URL.
process.env.SAHAJCLOUD_URL ||= 'https://cloud.sydevelopers.com'

const SECRET = 'preview-only-secret'

/** Titles of the documents naming the manager, per collection, and how many exist. */
type Managed = Partial<Record<'events' | 'pages' | 'regions', { titles: string[]; total?: number }>>

interface Scenario {
  label: string
  note: string
  /** What a `locale: 'all'` read of `roles` returns for this manager. */
  roles: Record<string, string[]>
  type: string
  name: string
  /** The manager's own `currentProject`. `null` for anyone who never signed in. */
  currentProject?: null | string
  /** Resend scenarios only — a create has nothing naming the manager yet. */
  managed?: Managed
}

/** What a create sends: roles only, since nothing can point at the account yet. */
const CREATE_SCENARIOS: Scenario[] = [
  {
    label: 'invite · one locale',
    note: 'the common case — a manager created with roles at the locale the admin was in',
    roles: { en: ['meditations-editor', 'path-editor'] },
    type: 'manager',
    name: 'Jo Smith',
  },
  {
    label: 'invite · atlas manager',
    note: 'a new Atlas manager — branded Sahaj Atlas by its role, with no current project',
    roles: { en: ['atlas-manager'] },
    type: 'manager',
    name: 'Lena Fischer',
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

const EVENTS = [
  'Tuesday Evening Meditation',
  'Sunday Morning Introduction',
  'Meditation in the Park',
  'Lunchtime Stress Relief',
  'Beginners Workshop',
]

/** What a resend sends: by then the regions, events and pages naming the manager exist. */
const RESEND_SCENARIOS: Scenario[] = [
  {
    label: 'resend · atlas manager',
    note: 'the typical imported Atlas manager: one region, the events in it',
    roles: { en: ['atlas-manager'] },
    type: 'manager',
    name: 'Lena Fischer',
    managed: { regions: { titles: ['Berlin'] }, events: { titles: EVENTS.slice(0, 2) } },
  },
  {
    label: 'resend · atlas, many events',
    note: 'several regions and 23 events — the first five are named, the rest counted',
    roles: { de: ['atlas-manager'], fr: ['atlas-manager'] },
    type: 'manager',
    name: 'Amélie Rousseau',
    managed: {
      regions: { titles: ['Alsace', 'Bavaria', 'Hesse'] },
      events: { titles: EVENTS, total: 23 },
    },
  },
  {
    label: 'resend · region, no role',
    note: 'named on a region before any role was assigned',
    roles: {},
    type: 'manager',
    name: 'Ravi Menon',
    managed: { regions: { titles: ['Lyon'] } },
  },
  {
    label: 'resend · page editor',
    note: 'a We Meditate translator named on pages — branded WeMeditate Web',
    roles: { fr: ['web-translator'] },
    type: 'manager',
    name: 'Claire Martin',
    managed: { pages: { titles: ['About Sahaja Yoga', 'Meditation for Beginners'] } },
  },
  {
    label: 'resend · unrelated current project',
    note: 'current project WeMeditate Web, but everything listed is Atlas — branded Sahaj Atlas',
    roles: { en: ['atlas-manager'] },
    type: 'manager',
    name: 'Tom Becker',
    currentProject: 'wemeditate-web',
    managed: { events: { titles: EVENTS.slice(2, 4) } },
  },
  {
    label: 'resend · related current project',
    note: 'current project WeMeditate Web, and a page is listed — so that brand is kept',
    roles: { en: ['atlas-manager', 'web-translator'] },
    type: 'manager',
    name: 'Marco Bianchi',
    currentProject: 'wemeditate-web',
    managed: { events: { titles: EVENTS.slice(0, 1) }, pages: { titles: ['Guided Meditations'] } },
  },
]

async function main() {
  const { Events, Managers, Pages, Regions } = await import('@/collections')
  const { managersLogin } = await import('@/collections/Managers/login')
  const { generateEmailHTML, generateEmailSubject } = await import('@/plugins/login/mail')
  const {
    generateInviteEmailHTML,
    generateInviteEmailSubject,
    inviteUrl,
    inviteVerification,
    prepareInvite,
    signInviteFor,
    SIGNIN_VALID_FOR,
  } = await import('@/plugins/login')

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

  // The four collections the summary reads config from, as Payload sanitizes
  // them: flattened fields, and a plural label filled in from the slug.
  const collections = Object.fromEntries(
    ([Managers, Regions, Events, Pages] as CollectionConfig[]).map((collection) => [
      collection.slug,
      {
        config: {
          ...collection,
          flattenedFields: flattenAllFields({ fields: collection.fields }),
          labels: {
            plural:
              typeof collection.labels?.plural === 'string'
                ? collection.labels.plural
                : collection.slug.charAt(0).toUpperCase() + collection.slug.slice(1),
          },
        },
      },
    ]),
  )

  // The two reads a summary makes: the roles, and a `find` per managed collection.
  const payloadFor = (scenario: Scenario) =>
    ({
      secret: SECRET,
      collections,
      findByID: async () => ({ roles: scenario.roles }),
      find: async ({ collection, limit }: { collection: keyof Managed; limit: number }) => {
        const { titles = [], total = titles.length } = scenario.managed?.[collection] ?? {}
        const titleField = collections[collection]!.config.admin?.useAsTitle ?? 'id'
        return {
          docs: titles.slice(0, limit).map((title) => ({ [titleField]: title })),
          totalDocs: total,
        }
      },
    }) as unknown as Payload

  const userFor = (scenario: Scenario) => ({
    id: 42,
    email: 'manager-preview@example.com',
    name: scenario.name,
    type: scenario.type,
    currentProject: scenario.currentProject ?? null,
  })

  const verify = inviteVerification(managersLogin)

  for (const scenario of CREATE_SCENARIOS) {
    const payload = payloadFor(scenario)
    const args = {
      req: { payload } as unknown as PayloadRequest,
      token: 'unused',
      user: userFor(scenario),
    }

    const html = await verify.generateEmailHTML!(args as never)
    await send(scenario, await verify.generateEmailSubject!(args as never), html)
  }

  for (const scenario of RESEND_SCENARIOS) {
    const payload = payloadFor(scenario)
    const doc = userFor(scenario)
    const { project, summary } = await prepareInvite({
      config: managersLogin,
      doc,
      payload,
      withResponsibilities: true,
    })
    const url = inviteUrl(managersLogin, await signInviteFor(managersLogin, doc, SECRET))

    await send(
      scenario,
      generateInviteEmailSubject(project),
      await generateInviteEmailHTML({ doc, inviteUrl: url, project, summary }),
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
