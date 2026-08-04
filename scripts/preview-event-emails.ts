/**
 * Operator script: render the event verification reminder emails (due /
 * escalated / expired) and send them to a throwaway Ethereal inbox for visual
 * review. Prints a direct preview link per level.
 *
 * Usage:
 *   pnpm tsx scripts/preview-event-emails.ts              # render-only (no DB)
 *   PERSIST_EVENT=1 pnpm tsx scripts/preview-event-emails.ts
 *
 * With PERSIST_EVENT=1 it first seeds a fully-populated sample Event (+ its
 * connected manager/region docs) into the local database and renders the
 * emails from that real event. This requires the local Postgres schema to be
 * up to date — if `push` would prompt interactively (e.g. right after a schema
 * change), sync it first (restart the dev server and answer the prompts, or
 * apply the pending migration). Without the flag, no database is touched.
 */

import type { EventDetails, ReminderAudience, ReminderLevel } from '@/emails/EventVerificationEmail'
import type { Event } from '@/payload-types'

import dotenv from 'dotenv'

dotenv.config({ path: '.env' })
dotenv.config({ path: '.env.local', override: true })

const DAY_MS = 24 * 60 * 60 * 1000
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toISOString()

interface SampleData {
  eventId: number
  eventTitle: string
  managerId: number
  managerName: string
  managerEmail: string
  adminUrl?: string
  regionLine?: string
  details?: EventDetails
}

/** Seed a fully-populated Event + connected docs and return its summary. */
async function persistSampleEvent(): Promise<SampleData> {
  const { getPayload } = await import('payload')
  const { default: config } = await import('../src/payload.config')
  const { buildReminderEntry, buildVerificationEntry } = await import('@/lib/eventVerification/log')
  const { buildEventEmailDetails } = await import('@/lib/notifications')

  const payload = await getPayload({ config })
  const stamp = Date.now()

  const eventManager = await payload.create({
    collection: 'managers',
    data: {
      name: 'Priya Deshmukh',
      email: `priya.sample.${stamp}@example.com`,
      password: 'password123',
      type: 'manager',
      notificationPreferences: {
        new_responsibility: { frequency: 'Immediate', method: 'email' },
        event_verification: { frequency: 'Monthly', method: 'email' },
        event_registration: { frequency: 'Immediate', method: 'email' },
        regional_summary: { frequency: 'Monthly', method: 'email' },
      },
      contactDetails: [{ platform: 'whatsapp', identifier: '+91 98765 43210', verified: true }],
    },
  })
  const regionManager = await payload.create({
    collection: 'managers',
    data: {
      name: 'Rohan Patil',
      email: `rohan.sample.${stamp}@example.com`,
      password: 'password123',
      type: 'manager',
    },
  })
  const country = await payload.create({
    collection: 'regions',
    data: {
      name: 'India',
      slug: `india-${stamp}`,
      level: 'country',
      mapboxId: `sample-in-${stamp}`,
      managers: [regionManager.id],
    },
  })
  const city = await payload.create({
    collection: 'regions',
    data: {
      name: 'Pune',
      slug: `pune-${stamp}`,
      level: 'city',
      mapboxId: `sample-pune-${stamp}`,
      parent: country.id,
      managers: [regionManager.id],
    },
  })

  let imageId: number | undefined
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#4a8cd4"/><text x="50%" y="50%" fill="#fff" font-family="sans-serif" font-size="32" text-anchor="middle" dominant-baseline="middle">Saturday Meditation</text></svg>`
    const image = await payload.create({
      collection: 'images',
      data: { alt: 'Saturday Morning Meditation banner' },
      file: {
        data: Buffer.from(svg, 'utf-8'),
        mimetype: 'image/svg+xml',
        name: `sample-event-${stamp}.svg`,
        size: Buffer.byteLength(svg),
      },
    })
    imageId = image.id
  } catch {
    // Image is optional — continue without it.
  }

  const description = {
    root: {
      type: 'root',
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      version: 1,
      children: [
        {
          type: 'paragraph',
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
          children: [
            {
              type: 'text',
              version: 1,
              format: 0,
              text: 'A gentle weekly Sahaja Yoga meditation open to all. Experience cool vibrations, guided self-realisation, and a calm start to your weekend. No experience needed — just come as you are.',
            },
          ],
        },
      ],
    },
  }

  const event = await payload.create({
    collection: 'events',
    data: {
      title: 'Saturday Morning Sahaja Yoga Meditation',
      language: 'en',
      contactPhone: '+91 98765 43210',
      contactName: 'Priya Deshmukh',
      description,
      ...(imageId ? { images: [imageId] } : {}),
      eventType: 'offline',
      address: {
        street: '12 MG Road',
        room: '2nd Floor, Cultural Hall',
        postCode: '411001',
        country: 'IN',
        region: 'Maharashtra',
        city: 'Pune',
        latitude: 18.5204,
        longitude: 73.8567,
      },
      region: city.id,
      registrationMode: 'sahaj-atlas',
      registrationLimit: 30,
      registrationQuestions: {
        priorExperience: true,
        referralSource: true,
        healthInfo: true,
        accessibility: true,
        guests: true,
      },
      schedule: {
        firstDate: iso(-21),
        firstDate_tz: 'Asia/Calcutta',
        recurrenceType: 'WEEKLY',
        interval: 1,
        weekdays: ['SA'],
        endTime: '10:30',
        endingType: 'count',
        count: 52,
        exclusions: [{ startDate: iso(40), endDate: iso(42), reason: 'Diwali break' }],
      },
      manager: eventManager.id,
      _status: 'published',
      // Cast: the drafts-enabled create overload over-constrains an inline
      // literal; the runtime shape is valid event data.
    } as unknown as Event,
  })

  // Put the event mid-escalation with a populated log so the admin notice
  // banner + RecordTable show realistic data (skipVerifyHook keeps these).
  const ref = (id: number, name: string) => ({ id, name })
  await payload.update({
    collection: 'events',
    id: event.id,
    overrideAccess: true,
    context: { skipVerifyHook: true },
    data: {
      verificationStage: 'escalated',
      nextCheckAt: iso(13),
      notificationLog: [
        buildVerificationEntry('import', ref(eventManager.id, eventManager.name!), iso(-35)),
        buildReminderEntry({
          stage: 'verified',
          level: 'due',
          role: 'manager',
          manager: ref(eventManager.id, eventManager.name!),
          channel: 'email',
          destination: eventManager.email,
          at: iso(-8),
        }),
        buildReminderEntry({
          stage: 'reminded',
          level: 'escalated',
          role: 'manager',
          manager: ref(eventManager.id, eventManager.name!),
          channel: 'email',
          destination: eventManager.email,
          at: iso(-1),
        }),
        buildReminderEntry({
          stage: 'reminded',
          level: 'escalated',
          role: 'region',
          region: 'Maharashtra',
          manager: ref(regionManager.id, regionManager.name!),
          channel: 'email',
          destination: regionManager.email,
          at: iso(-1),
        }),
      ],
    },
  })

  // Seed a few recent registrations (best-effort) so the email's
  // "Registrations (last 30 days)" row is populated.
  try {
    const seeker = await payload.create({
      collection: 'users',
      data: { name: 'Sample Seeker', email: `seeker.sample.${stamp}@example.com` },
    })
    for (let i = 0; i < 8; i++) {
      await payload.create({
        collection: 'registrations',
        data: { event: event.id, user: seeker.id, uuid: `sample-reg-${stamp}-${i}` },
      })
    }
  } catch {
    // Registrations are optional — the row is simply omitted without them.
  }

  const details = await buildEventEmailDetails({ payload, event })

  const serverUrl = process.env.SAHAJCLOUD_URL || `http://localhost:${process.env.PORT || 3000}`
  return {
    eventId: event.id,
    eventTitle: event.title!,
    managerId: eventManager.id,
    managerName: eventManager.name!,
    managerEmail: eventManager.email,
    adminUrl: `${serverUrl}/admin/collections/events/${event.id}`,
    regionLine: `${city.name} → ${country.name} (region mgr ${regionManager.name})`,
    details,
  }
}

/**
 * A partly-translated locale, to show the two things the English previews
 * can't: copy resolved for a manager's own language, and the per-key fallback
 * when a translator hasn't filled everything in (labels stay English here).
 */
const CZECH_SAMPLE: Record<string, string> = {
  verify_greeting: 'Dobrý den, %{name},',
  verify_manager_due_subject: 'Ověřte prosím svou událost: %{event}',
  verify_manager_due_heading: 'Ověřte svou hodinu Sahaja Yogy',
  verify_manager_due_preview: 'Rychlá kontrola, že vaše hodina stále probíhá.',
  verify_manager_due_cta: 'Ověřit událost',
  verify_manager_due_body:
    'Aby byly veřejné výpisy přesné, je potřeba události na %{brand} pravidelně kontrolovat. Neověřené události se automaticky skryjí. Zkontrolujte prosím údaje o své hodině níže.',
  verify_manager_due_callout: '✅ Ověřte do %{deadline}, aby událost zůstala zveřejněná.',
  verify_details_heading: 'Údaje o události',
}

async function main() {
  const nodemailer = (await import('nodemailer')).default
  const { sendEmailReminder } = await import('@/lib/notifications/channels/email')
  const { signVerifyToken } = await import('@/lib/eventVerification/token')
  const { buildVerifyEmailLink } = await import('@/lib/eventVerification/verifyUrl')
  const { formatLongDate } = await import('@/lib/notifications')

  const sample: SampleData = process.env.PERSIST_EVENT
    ? await persistSampleEvent()
    : {
        eventId: 1042,
        eventTitle: 'Saturday Morning Sahaja Yoga Meditation',
        managerId: 7,
        managerName: 'Priya Deshmukh',
        managerEmail: 'priya.deshmukh@example.com',
        details: {
          title: 'Saturday Morning Sahaja Yoga Meditation',
          isOnline: false,
          location: '12 MG Road, 2nd Floor, Cultural Hall, Pune, Maharashtra, IN 411001',
          schedule: 'Every week on Saturday at 9:26 AM',
          contact: 'Priya Deshmukh · +91 98765 43210',
          breaks: ['Diwali break: 21 Jul – 23 Jul 2026'],
          lastVerified: 'Wednesday, 12 March 2026',
          recentRegistrations: 8,
        },
      }

  const secret = process.env.PAYLOAD_SECRET || 'preview-secret'

  const account = await nodemailer.createTestAccount()
  const transport = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.user, pass: account.pass },
  })

  // Illustrative timing: a shared unpublish date in the future, "today" once
  // expired, and a sample "last verified" age + event-manager contact card.
  const futureDeadline = formatLongDate(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  )
  const today = formatLongDate(new Date().toISOString())
  const sinceLastVerified = '3 months'
  const eventManager = {
    name: sample.managerName,
    contacts: [
      { label: 'Email', value: sample.managerEmail },
      { label: 'WhatsApp', value: '+91 98765 43210' },
    ],
  }

  // The event manager gets all four levels; region managers are looped in from
  // escalated onward (a different framing + the manager's contacts). The last
  // combo is the same `due` reminder for a Czech-speaking manager.
  const combos: {
    level: ReminderLevel
    audience: ReminderAudience
    language?: string
    translations?: Record<string, string>
    note?: string
  }[] = [
    { level: 'due', audience: 'manager' },
    { level: 'escalated', audience: 'manager' },
    { level: 'urgent', audience: 'manager' },
    { level: 'expired', audience: 'manager' },
    { level: 'escalated', audience: 'region' },
    { level: 'urgent', audience: 'region' },
    { level: 'expired', audience: 'region' },
    {
      level: 'due',
      audience: 'manager',
      language: 'cs',
      translations: CZECH_SAMPLE,
      note: 'partly-translated locale — untranslated keys fall back to English',
    },
  ]

  const previews: { label: string; note?: string; url: string | false }[] = []
  for (const { level, audience, language, translations, note } of combos) {
    const label = `${audience} · ${level}${language ? ` · ${language}` : ''}`
    const token = signVerifyToken({ eventId: sample.eventId, managerId: sample.managerId }, secret)
    const destination = audience === 'region' ? 'rohan.patil@example.com' : sample.managerEmail

    // Drive the real send path so the preview can't drift from production —
    // it resolves the manager's language, renders, and builds the subject.
    // Only the two seams a preview must fake are stubbed: the translations
    // read and the transport.
    const payload = {
      findGlobal: async () => ({ emails: translations ?? {} }),
      logger: { debug() {}, error() {}, info() {}, warn() {} },
      sendEmail: async (message: Record<string, unknown>) => {
        const info = await transport.sendMail({
          ...message,
          from: 'Sahaj Atlas <dev@wemeditate.com>',
          // Label the inbox row so combos are distinguishable at a glance; the
          // real (localized) subject stays visible inside the message.
          subject: `[${label}] ${String(message.subject)}`,
        } as never)
        previews.push({ label, note, url: nodemailer.getTestMessageUrl(info) })
      },
    }

    await sendEmailReminder(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload as any,
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        manager: {
          name: audience === 'region' ? 'Rohan Patil' : sample.managerName,
          language,
        } as any,
        role: audience,
        channel: 'email',
        destination,
        regionName: audience === 'region' ? 'Maharashtra' : undefined,
      },
      {
        eventTitle: sample.eventTitle,
        level,
        audience,
        verifyUrl: buildVerifyEmailLink(token),
        // Published events link to the map; expired (unpublished) ones don't.
        eventUrl:
          level === 'expired' ? null : `https://wemeditate.com/map#/!/events/${sample.eventId}`,
        details: sample.details,
        deadline: level === 'expired' ? today : futureDeadline,
        sinceLastVerified,
        regionName: audience === 'region' ? 'Maharashtra' : undefined,
        eventManager: audience === 'region' ? eventManager : undefined,
      },
    )
  }

  console.log('\n━━━ Event verification reminder previews ━━━\n')
  console.log(`Event:    "${sample.eventTitle}"`)
  console.log(`Manager:  ${sample.managerName} <${sample.managerEmail}>`)
  if (sample.adminUrl) console.log(`Admin:    ${sample.adminUrl}`)
  if (sample.regionLine) console.log(`Region:   ${sample.regionLine}`)
  if (!process.env.PERSIST_EVENT)
    console.log('(render-only — no database written; set PERSIST_EVENT=1 to seed the event)')
  console.log(`\nEthereal inbox (all messages): https://ethereal.email/login`)
  console.log(`  user: ${account.user}`)
  console.log(`  pass: ${account.pass}`)
  console.log(`\nDirect preview links:`)
  for (const { label, note, url } of previews) {
    console.log(`  ${label.padEnd(26)} ${url}${note ? `\n  ${' '.repeat(26)} ↳ ${note}` : ''}`)
  }
  console.log('')

  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
