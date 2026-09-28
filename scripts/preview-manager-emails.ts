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
 * ⚠ **It drives the real composition, not the template.** Every invitation
 * goes through `composeInvitations`, the function both senders run — the queue
 * task and `issueMagicLink`'s resend — so the subject, the brand, the button
 * and every line are exactly what a real send produces. The `payload` stub
 * answers only the database reads (the `locale: 'all'` roles read, and a
 * `find` per managed collection), and its collection configs are the real
 * ones, so the preview cannot drift.
 */

import type { CollectionConfig, Payload } from 'payload'

import dotenv from 'dotenv'
import { flattenAllFields } from 'payload'

import { createCaptureTransport } from './mailpit-transport'

// Shell env wins, then .env.local, then .env (see seeds/env.ts).
dotenv.config({ path: ['.env.local', '.env'] })

// Absolute icon URLs must resolve for the reviewer. Default to production,
// since the Mailpit viewer cannot reach a localhost URL.
process.env.SAHAJCLOUD_URL ||= 'https://cloud.sydevelopers.com'

const SECRET = 'preview-only-secret'
const ATLAS = 'https://sahajatlas.com'

/** A managed document as the stub returns it: a title, and its public page if it has one. */
type Doc = { title: string; url?: string }

type Managed = Partial<Record<'events' | 'pages' | 'regions', Doc[]>>

interface Scenario {
  label: string
  note: string
  name: string
  type: 'admin' | 'manager'
  /** Accepted before — then the email is a notice with a button to the admin. */
  accepted?: boolean
  /** The manager's own `currentProject`. `null` for anyone who never signed in. */
  currentProject?: null | string
  /** Who assigned it, for a queued invitation. */
  assignedBy?: string
  /** What a `locale: 'all'` read of `roles` returns. */
  roles: Record<string, string[]>
  /** The documents naming the manager. */
  managed: Managed
  /**
   * What was queued, for an invitation the queue sends. Absent for a resend,
   * which names everything held.
   */
  queued?: boolean
}

const event = (title: string, published = true): Doc => ({
  title,
  ...(published && { url: `${ATLAS}/berlin/${title.toLowerCase().replaceAll(' ', '-')}` }),
})

const SCENARIOS: Scenario[] = [
  {
    label: 'atlas · first assignment',
    note: 'an admin names a new manager on a region and two events — one not yet published',
    name: 'Lena Fischer',
    type: 'manager',
    assignedBy: 'Anna Schmidt',
    roles: { en: ['atlas-manager'] },
    managed: {
      regions: [{ title: 'Berlin', url: `${ATLAS}/germany/berlin` }],
      events: [event('Tuesday Evening Meditation'), event('Sunday Morning Introduction', false)],
    },
    queued: true,
  },
  {
    label: 'atlas · one event',
    note: 'a single event — the heading names it',
    name: 'Tom Becker',
    type: 'manager',
    assignedBy: 'Anna Schmidt',
    roles: {},
    managed: { events: [event('Meditation in the Park')] },
    queued: true,
  },
  {
    label: 'atlas · accepted, new events',
    note: 'a manager who has confirmed — told what is new, with a button to their notification settings',
    name: 'Amélie Rousseau',
    type: 'manager',
    accepted: true,
    currentProject: 'sahaj-atlas',
    assignedBy: 'Anna Schmidt',
    roles: {},
    managed: {
      events: [
        event('Lunchtime Stress Relief'),
        event('Beginners Workshop'),
        event('Evening Sitting', false),
      ],
    },
    queued: true,
  },
  {
    label: 'atlas · unrelated current project',
    note: 'current project WeMeditate Web, but everything assigned is Atlas — branded Sahaj Atlas',
    name: 'Marco Bianchi',
    type: 'manager',
    accepted: true,
    currentProject: 'wemeditate-web',
    roles: {},
    managed: { regions: [{ title: 'Milan', url: `${ATLAS}/italy/milan` }] },
    queued: true,
  },
  {
    label: 'we meditate · new role',
    note: 'a role and nothing to look after — the heading names the role',
    name: 'Claire Martin',
    type: 'manager',
    assignedBy: 'Anna Schmidt',
    roles: { fr: ['web-translator'] },
    managed: {},
    queued: true,
  },
  {
    label: 'we meditate · pages',
    note: 'a translator named on two pages, one unpublished',
    name: 'Claire Martin',
    type: 'manager',
    accepted: true,
    currentProject: 'wemeditate-web',
    roles: {},
    managed: {
      pages: [
        { title: 'About Sahaja Yoga', url: 'https://wemeditate.com/about' },
        { title: 'Meditation for Beginners' },
      ],
    },
    queued: true,
  },
  {
    label: 'two projects',
    note: 'an Atlas event and a We Meditate page assigned together — one email per project',
    name: 'Priya Shah',
    type: 'manager',
    assignedBy: 'Anna Schmidt',
    roles: { en: ['atlas-manager'], fr: ['web-translator'] },
    managed: {
      events: [event('Tuesday Evening Meditation')],
      pages: [{ title: 'About Sahaja Yoga', url: 'https://wemeditate.com/about' }],
    },
    queued: true,
  },
  {
    label: 'resend · imported atlas manager',
    note: 'an unaccepted manager asks for a link — the invitation names everything they hold',
    name: 'Ravi Menon',
    type: 'manager',
    roles: { en: ['atlas-manager'] },
    managed: {
      regions: [
        { title: 'Bavaria', url: `${ATLAS}/germany/bavaria` },
        { title: 'Hesse', url: `${ATLAS}/germany/hesse` },
      ],
      events: [
        event('Tuesday Evening Meditation'),
        event('Sunday Morning Introduction'),
        event('Meditation in the Park'),
        event('Beginners Workshop', false),
      ],
    },
  },
]

async function main() {
  const { Events, Managers, Pages, Regions } = await import('@/collections')
  const { managersLogin } = await import('@/collections/Managers/login')
  const { generateEmailHTML, generateEmailSubject } = await import('@/plugins/login/mail')
  const { composeInvitations } = await import('@/plugins/login/invite')
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

  // The four collections the summary reads config from, as Payload sanitizes
  // them: flattened fields, and labels filled in from the slug.
  const collections = Object.fromEntries(
    ([Managers, Regions, Events, Pages] as CollectionConfig[]).map((collection) => {
      const words = collection.slug.charAt(0).toUpperCase() + collection.slug.slice(1)
      const { plural, singular } = collection.labels ?? {}
      return [
        collection.slug,
        {
          config: {
            ...collection,
            flattenedFields: flattenAllFields({ fields: collection.fields }),
            labels: {
              plural: typeof plural === 'string' ? plural : words,
              singular: typeof singular === 'string' ? singular : words.replace(/s$/, ''),
            },
          },
        },
      ]
    }),
  )

  for (const scenario of SCENARIOS) {
    // The two reads a summary makes: the roles, and a `find` per managed collection.
    const payload = {
      secret: SECRET,
      collections,
      findByID: async () => ({ roles: scenario.roles }),
      find: async ({ collection }: { collection: keyof Managed }) => {
        const titleField = collections[collection]!.config.admin?.useAsTitle ?? 'id'
        return {
          docs: (scenario.managed[collection] ?? []).map((doc, index) => ({
            id: index + 1,
            [titleField]: doc.title,
            webUrl: doc.url ?? null,
          })),
        }
      },
    } as unknown as Payload

    // What the queue would hold: everything this scenario names, as new.
    const only = scenario.queued
      ? {
          roles: scenario.roles,
          managed: Object.fromEntries(
            Object.entries(scenario.managed).map(([slug, docs]) => [
              slug,
              docs.map((_, index) => index + 1),
            ]),
          ),
        }
      : undefined

    const invitations = await composeInvitations({
      assignedBy: scenario.assignedBy,
      config: managersLogin,
      doc: {
        id: 42,
        email: 'manager-preview@example.com',
        name: scenario.name,
        type: scenario.type,
        currentProject: scenario.currentProject ?? null,
        _verified: scenario.accepted === true,
      },
      only,
      payload,
    })
    if (invitations.length === 0) throw new Error(`${scenario.label}: the invitation named nothing`)

    // One email per project: label each with its sender when there are several.
    for (const invitation of invitations) {
      const label =
        invitations.length > 1
          ? `${scenario.label} (${invitation.from.replace(/ <.*/, '')})`
          : scenario.label
      await send({ label, note: scenario.note }, invitation.subject, invitation.html)
    }
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
