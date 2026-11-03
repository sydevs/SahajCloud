/**
 * Preview Seed — one submission of every type, in the statuses a reviewer
 * needs to see, plus everything they hang off.
 *
 * A Railway PR preview boots with one row in the whole database — its admin
 * (`src/plugins/previewAdmin`) — so every list a PR's preview links point at
 * is empty. This fills `user-submissions` and what it references: a region, a
 * published event, a client, a contact form, a subscribe form, and the
 * Registrants the rows upsert, one of them blocked.
 *
 * ⚠ **Every row is inserted already settled.** A preview inherits production's
 * variables, so a row that reached screening and then delivery would email the
 * form's recipient, the event's manager, and the live mailing provider. A
 * `pending` row carries a `screeningResult`, which makes the screening job a
 * no-op, and nothing else queues delivery. No registration ticks the mailing
 * list box, because that spawns a fresh `pending` subscribe row.
 *
 * ⚠ **Reserved addresses only** (`@example.org`, RFC 2606). Never a real person.
 *
 * ⚠ **Refuses production.** `pnpm seed` with no script never runs it (it is
 * absent from `SCRIPT_RUN_ORDER`), and this is the second lock.
 *
 * Idempotent: every row has a natural key, so a re-run skips what exists and
 * recreates what the retention windows have since purged (accepted contact
 * rows go at 7 days, decided proposals at 30).
 */
import path from 'path'

import type { UserSubmission } from '@/payload-types'
import { isProductionDeployment } from '@/plugins/storage/previewIsolation'

import { BaseImporter, type BaseImportOptions } from '../lib'

type Screening = NonNullable<UserSubmission['screeningResult']>
type SubmissionRow = Partial<UserSubmission> & { uuid: string; senderEmail?: string }

const ADDRESSES = {
  visitor: 'ada.visitor@example.org',
  subscriber: 'ben.subscriber@example.org',
  registrant: 'chandra.registrant@example.org',
  proposer: 'dev.proposer@example.org',
  throwaway: 'throwaway@example.org',
  blocked: 'blocked.sender@example.org',
} as const

/** A fixed v4-shaped id per row: the natural key a re-run matches on. */
const uuidFor = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const CONTEXT = [
  { field: 'locale', value: 'en' },
  { field: 'path', value: '/map/preview-city' },
  { field: 'hostUrl', value: 'https://www.example.org' },
  { field: 'userAgent', value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) Preview Seed' },
]

export class PreviewImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'Preview'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/preview')

  protected async setup(): Promise<void> {
    if (isProductionDeployment()) {
      throw new Error('The preview seed writes example data, and refuses to run in production.')
    }
  }

  protected async import(): Promise<void> {
    const { docs: admins } = await this.payload.find({
      collection: 'managers',
      where: { type: { equals: 'admin' } },
      limit: 1,
      depth: 0,
    })
    const admin = admins[0]
    if (!admin) {
      this.addError('managers', 'No admin manager to own the seeded client, forms and event.')
      return
    }

    const region = await this.upsert(
      'regions',
      { mapboxId: { equals: 'manual-preview-seed-city' } },
      {
        name: 'Preview City',
        level: 'city',
        mapboxId: 'manual-preview-seed-city',
        latitude: 51.5072,
        longitude: -0.1276,
        radius: 5000,
      },
      { identifier: 'Preview City' },
    )

    const client = await this.upsert(
      'clients',
      { name: { equals: 'Preview Seed Client' } },
      {
        name: 'Preview Seed Client',
        managers: [admin.id],
        primaryContact: admin.id,
        roles: ['sahaj-atlas-client'],
        _status: 'published',
      },
      { identifier: 'Preview Seed Client' },
    )

    const contactForm = await this.upsert(
      'forms',
      { title: { equals: 'Preview Seed — Contact' } },
      {
        title: 'Preview Seed — Contact',
        actionType: 'contact',
        recipient: admin.id,
        confirmationType: 'redirect',
        redirect: { url: '/thanks' },
        fields: [
          { blockType: 'text', name: 'name', label: 'Your name' },
          { blockType: 'email', name: 'email', label: 'Email address' },
          { blockType: 'text', name: 'subject', label: 'Subject' },
          { blockType: 'textarea', name: 'message', label: 'Your message' },
        ],
      },
      { identifier: 'Preview Seed — Contact' },
    )

    const subscribeForm = await this.upsert(
      'forms',
      { title: { equals: 'Preview Seed — Newsletter' } },
      {
        title: 'Preview Seed — Newsletter',
        actionType: 'subscribe',
        client: client.doc.id,
        confirmationType: 'redirect',
        redirect: { url: '/thanks' },
        fields: [
          { blockType: 'text', name: 'name', label: 'Your name' },
          { blockType: 'email', name: 'email', label: 'Email address' },
        ],
      },
      { identifier: 'Preview Seed — Newsletter' },
    )

    const event = await this.upsert(
      'events',
      { contactName: { equals: 'Preview Seed Host' } },
      {
        title: 'Preview Seed Meditation Class',
        languages: ['en'],
        manager: admin.id,
        region: region.doc.id,
        verificationStage: 'verified',
        inactive: true,
        contactName: 'Preview Seed Host',
        contactPhone: '+44 20 7946 0000',
        _status: 'published',
      },
      { identifier: 'Preview Seed Meditation Class', context: { skipVerifyHook: true } },
    )

    // Before its submissions, so the block is already on the record they join.
    await this.upsert(
      'users',
      { email: { equals: ADDRESSES.blocked } },
      {
        name: 'Blocked Sender',
        email: ADDRESSES.blocked,
        blockedAt: new Date().toISOString(),
        blockedReason: 'Sent the same advert to every form (seeded example).',
      },
      { identifier: ADDRESSES.blocked },
    )

    const rows = this.submissions({
      clientId: Number(client.doc.id),
      contactFormId: Number(contactForm.doc.id),
      subscribeFormId: Number(subscribeForm.doc.id),
      eventId: Number(event.doc.id),
      regionId: Number(region.doc.id),
    })

    for (const [index, row] of rows.entries()) {
      try {
        await this.upsert('user-submissions', { uuid: { equals: row.uuid } }, row, {
          identifier: `${row.type} · ${row.status}`,
          current: index + 1,
          total: rows.length,
        })
      } catch (error) {
        this.addError(`user-submissions ${row.uuid}`, error as Error)
      }
    }
  }

  private submissions(ids: {
    clientId: number
    contactFormId: number
    subscribeFormId: number
    eventId: number
    regionId: number
  }): SubmissionRow[] {
    const now = Date.now()
    const ago = (days: number) => new Date(now - days * 86_400_000).toISOString()
    const screened = (verdict: Screening['verdict'], notes?: string[]): Screening => ({
      verdict,
      ...(notes ? { notes } : {}),
      screenedAt: ago(0),
    })
    const log = (activity: string, extra: Record<string, string> = {}) => [
      {
        at: ago(0),
        type: 'seed',
        cells: { activity, ...extra },
      },
    ]

    return [
      {
        uuid: uuidFor(1),
        type: 'contact',
        status: 'pending',
        form: ids.contactFormId,
        client: ids.clientId,
        senderEmail: ADDRESSES.visitor,
        screeningResult: screened('ok'),
        submissionData: [
          { field: 'name', value: 'Ada Visitor' },
          { field: 'subject', value: 'Is the Thursday class still on?' },
          {
            field: 'message',
            value:
              'Hello,\n\nThe map still lists the Thursday evening class, but the hall looked closed last week. Is it still running?\n\nThanks, Ada',
          },
          ...CONTEXT,
        ],
      },
      {
        uuid: uuidFor(2),
        type: 'contact',
        status: 'accepted',
        form: ids.contactFormId,
        client: ids.clientId,
        senderEmail: ADDRESSES.visitor,
        screeningResult: screened('ok'),
        activityLog: log('Delivered — screening passed', { sentTo: 'the form’s recipient' }),
        submissionData: [
          { field: 'name', value: 'Ada Visitor' },
          { field: 'subject', value: 'Thank you' },
          { field: 'message', value: 'Thank you for the session last week.' },
          ...CONTEXT,
        ],
      },
      {
        uuid: uuidFor(3),
        type: 'contact',
        status: 'failed',
        form: ids.contactFormId,
        client: ids.clientId,
        senderEmail: ADDRESSES.visitor,
        screeningResult: screened('ok'),
        activityLog: log('Delivery failed — the mail transport refused it'),
        submissionData: [
          { field: 'name', value: 'Ada Visitor' },
          { field: 'message', value: 'Do I need to bring anything?' },
          ...CONTEXT,
          {
            field: 'error',
            value: 'TypeError: Failed to fetch\n    at submit (widget.js:1:2345)',
          },
        ],
      },
      {
        uuid: uuidFor(4),
        type: 'contact',
        status: 'spam',
        form: ids.contactFormId,
        client: ids.clientId,
        senderEmail: ADDRESSES.throwaway,
        screeningResult: screened('disposable_email', [
          'The sender used a disposable-email domain. Treat any address here as unreachable.',
        ]),
        submissionData: [{ field: 'message', value: 'Cheap watches, click here.' }],
      },
      {
        uuid: uuidFor(5),
        type: 'contact',
        status: 'spam',
        form: ids.contactFormId,
        client: ids.clientId,
        senderEmail: ADDRESSES.blocked,
        screeningResult: screened('blocked_sender', [
          'This sender is blocked, so nothing they send is delivered. Lift the block on their Registrant record.',
        ]),
        submissionData: [
          { field: 'name', value: 'Blocked Sender' },
          { field: 'message', value: 'The same advert, again.' },
        ],
      },
      {
        uuid: uuidFor(6),
        type: 'subscribe',
        status: 'accepted',
        form: ids.subscribeFormId,
        client: ids.clientId,
        senderEmail: ADDRESSES.subscriber,
        screeningResult: screened('ok'),
        activityLog: log('Subscribed — added to the mailing list'),
        submissionData: [
          { field: 'name', value: 'Ben Subscriber' },
          { field: 'locale', value: 'en' },
        ],
      },
      {
        // The consent row a registration opt-in spawns: an event, no form.
        uuid: uuidFor(7),
        type: 'subscribe',
        status: 'accepted',
        event: ids.eventId,
        client: ids.clientId,
        senderEmail: ADDRESSES.registrant,
        screeningResult: screened('ok'),
        submissionData: [
          { field: 'name', value: 'Chandra Registrant' },
          { field: 'locale', value: 'en' },
        ],
      },
      {
        uuid: uuidFor(8),
        type: 'registration',
        status: 'accepted',
        event: ids.eventId,
        client: ids.clientId,
        senderEmail: ADDRESSES.registrant,
        // In the past, so no reminder job picks it up.
        startingAt: ago(3),
        screeningResult: screened('ok'),
        submissionData: [
          { field: 'name', value: 'Chandra Registrant' },
          { field: 'experience', value: 'A little, a few years ago.' },
          { field: 'referral', value: 'A friend told me.' },
          { field: 'aspirations', value: 'A calmer mind before work.' },
          { field: 'questions', value: 'Is there step-free access?' },
          ...CONTEXT,
        ],
      },
      {
        uuid: uuidFor(9),
        type: 'registration',
        status: 'accepted',
        event: ids.eventId,
        client: ids.clientId,
        senderEmail: ADDRESSES.visitor,
        startingAt: ago(10),
        unsubscribedAt: ago(9),
        screeningResult: screened('ok'),
        activityLog: [
          {
            at: ago(9),
            type: 'unsubscribe',
            key: 'reminders',
            cells: { activity: 'Unsubscribed from reminders' },
          },
        ],
        submissionData: [
          { field: 'name', value: 'Ada Visitor' },
          { field: 'experience', value: 'None yet.' },
        ],
      },
      {
        uuid: uuidFor(10),
        type: 'proposal',
        status: 'pending',
        client: ids.clientId,
        senderEmail: ADDRESSES.proposer,
        region: ids.regionId,
        screeningResult: screened('ok'),
        proposed: {
          languages: ['en'],
          contactName: 'Dev Proposer',
          contactPhone: '+44 20 7946 0001',
        },
        submissionData: [
          { field: 'name', value: 'Dev Proposer' },
          { field: 'note', value: 'We meet every Sunday morning in the community centre.' },
          ...CONTEXT,
        ],
      },
      {
        uuid: uuidFor(11),
        type: 'proposal',
        status: 'pending',
        event: ids.eventId,
        client: ids.clientId,
        senderEmail: ADDRESSES.proposer,
        screeningResult: screened('ok'),
        proposed: { contactPhone: '+44 20 7946 0099' },
        submissionData: [
          { field: 'name', value: 'Dev Proposer' },
          { field: 'note', value: 'The contact number changed last month.' },
        ],
      },
      {
        uuid: uuidFor(12),
        type: 'proposal',
        status: 'rejected',
        event: ids.eventId,
        client: ids.clientId,
        senderEmail: ADDRESSES.proposer,
        screeningResult: screened('ok'),
        activityLog: log('Rejected by a reviewer'),
        proposed: { contactName: 'Somebody Else' },
        submissionData: [{ field: 'note', value: 'Please make me the contact instead.' }],
      },
    ]
  }
}

export default PreviewImporter
