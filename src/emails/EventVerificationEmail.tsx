import type { CSSProperties, ReactNode } from 'react'

import { Hr, Link, Section, Text } from 'react-email'

import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'

import {
  BrandButton,
  DetailRow,
  EmailLayout,
  ProgressBar,
  SectionHeading,
  styles,
} from './EmailLayout'

/** One already-passing check, as a ticked line. */
const doneItem: CSSProperties = {
  fontSize: '14px',
  color: '#4b5563',
  margin: '0 0 4px',
}

/** …indented to line up with the `DetailRow` cells it sits under (open state). */
const doneItemIndented: CSSProperties = { ...doneItem, padding: '0 12px' }

/**
 * The completed-listing note's box. Deliberately grey rather than another
 * `CALLOUT_COLORS` entry: those are keyed on how urgent verification is, and
 * this says the opposite. It's a box at all because the complete state carries
 * neither a section heading nor a progress bar, so without one it runs
 * straight into the event-details table above it.
 */
const completeCallout: CSSProperties = {
  backgroundColor: '#f3f4f6',
  borderLeft: '4px solid #9ca3af',
  borderRadius: '4px',
  padding: '12px 14px',
  margin: '28px 0 16px',
}

/**
 * The completed-listing note's first line. Carries the emphasis a
 * `SectionHeading` would, without its uppercase treatment — inside the box it
 * reads as the note's own opening rather than as another section of the email.
 */
const completeHeading: CSSProperties = {
  fontSize: '15px',
  fontWeight: 700,
  color: '#1f2937',
  margin: '0 0 4px',
}

/** Escalation level → email copy. Mirrors the job's reminder stages. */
export type ReminderLevel = 'due' | 'escalated' | 'urgent' | 'expired'

/** Who the reminder is going to — its manager, or a region manager above it. */
export type ReminderAudience = 'manager' | 'region'

/** Key event facts shown in the email so the manager can verify at a glance. */
export interface EventDetails {
  title: string
  /** `Address` (offline) or `Online`. */
  locationLabel: string
  /** One-line address, or the online URL. */
  location: string
  /** One-line schedule summary. */
  schedule: string
  /** Contact name · phone, when set. */
  contact?: string
  /** Formatted scheduled-break lines, when any. */
  breaks?: string[]
  /** Date the event was last verified (shown in every email). */
  lastVerified: string
  /** Registrations in the last 30 days — omitted when there are none. */
  recentRegistrations?: number
}

/** The event manager's contact card, shown to region managers. */
export interface EventManagerContact {
  name: string
  contacts: { label: string; value: string }[]
}

/**
 * One open listing-quality recommendation (#609), resolved for display.
 *
 * The wording is resolved before it reaches the template — the check registry
 * owns it, so the email and the admin panel can't drift apart. `key` rides
 * along unused by the render, but it's what makes the list localizable if
 * manager locales ever come back (#610 was dropped).
 */
export interface EventSuggestion {
  /** Stable check key, e.g. `description.missing`. */
  key: string
  /** The recommendation, in the imperative — "Add a description". */
  label: string
  /** What the check actually found, or why the item is worth doing. */
  detail: string
}

/**
 * How complete a listing is, as the reminder email presents it.
 *
 * Carries what already passes as well as what's open, because the point of
 * showing a manager `2 of 4` is that the 2 they've already done are visible
 * next to the 2 that aren't. Absent (`undefined`) means the listing was never
 * checked and the whole section is suppressed — distinct from a complete
 * listing, which arrives with an empty `open`.
 */
export interface EventListingProgress {
  /** What's still to do, in registry order. */
  open: EventSuggestion[]
  /** What already passes, worded as a state reached ("Has a description"). */
  done: { key: string; label: string }[]
  /** Checks passed, out of those with a verdict. `resolved <= total`. */
  resolved: number
  total: number
}

interface EventVerificationEmailProps {
  /** Recipient display name. */
  name: string
  /** The event's title. */
  eventTitle: string
  /** Absolute, tokenized verify link (works logged-out). */
  verifyUrl: string
  /** Public link to the event on the Sahaj Atlas map — omitted when unpublished. */
  eventUrl?: string | null
  /** Escalation level — selects the copy. */
  level: ReminderLevel
  /** Whether the recipient is the event manager or a region manager. */
  audience: ReminderAudience
  /** Formatted date the event is / was unpublished. */
  deadline?: string
  /** Human duration the event has gone unverified. */
  sinceLastVerified: string
  /** Key event facts (rendered as a summary table). */
  details?: EventDetails
  /**
   * How complete the listing is (#611). Omitted renders nothing at all — that
   * is the "never checked" case, not a clean bill of health.
   */
  listingProgress?: EventListingProgress
  /** The ancestor region linking a region manager to the event (region audience). */
  regionName?: string
  /** Event manager's contacts — shown to region managers so they can reach out. */
  eventManager?: EventManagerContact
  /** Project to brand for. Defaults to `sahaj-atlas` (events are Atlas). */
  project?: ProjectSlug
}

/** Interpolation values available to every `body` below. */
interface CopyVars {
  /** The event title (bold). */
  title: ReactNode
  /** The event manager's name (bold) — for region copy. */
  manager: ReactNode
  /** The product/brand name, e.g. "Sahaj Atlas". */
  brandName: string
  /** The unpublish date (bold), or "shortly" when unknown. */
  deadline: ReactNode
  /** The region linking a region manager to the event (bold) — region copy. */
  region: ReactNode
  /** How long the event has gone unverified. */
  sinceLastVerified: string
}

/**
 * Wording for one state of the listing-progress section, keyed the same way
 * `VariantCopy` is: `COPY.listing[state]` mirrors `COPY.variants[audience][level]`,
 * so both states are guaranteed to carry the same fields.
 */
interface ListingStateCopy {
  /** Section heading. */
  heading: string
  /** The line under the heading. */
  intro: ReactNode
}

interface VariantCopy {
  /** Card heading. */
  heading: string
  /** Inbox preview snippet. */
  preview: string
  /** Verify-button label. */
  cta: string
  /** The main paragraph. */
  body: (vars: CopyVars) => ReactNode
  /** Coloured callout banner — the plain-English "do X by {deadline}" instruction. */
  callout: (vars: CopyVars) => ReactNode
}

/* ───────────────────────────────────────────────────────────────────────────
 * EMAIL COPY — edit everything here.
 *
 * `COPY.variants[audience][level]` holds the entire wording for one variation
 * (heading, inbox preview, button label, body paragraph, and optional callout)
 * in a single block, so a variation can be reworded without hunting through the
 * component. `{values}` in a `body` come from CopyVars above. Shared lines
 * (greeting, footer, button hint) sit at the top.
 * ─────────────────────────────────────────────────────────────────────────── */
const COPY: {
  greeting: (name: string) => ReactNode
  buttonHint: string
  footer: (audience: ReminderAudience, brandName: string) => ReactNode
  /** The listing-quality progress section (#611). */
  listing: {
    /** "2 of 4 complete" — the caption beside the progress bar. */
    caption: (resolved: number, total: number) => string
    /**
     * Small heading over the already-passing ticks. Open state only — when
     * everything passes, the one-line heading already introduces them.
     */
    doneHeading: string
    /** Something left to do. */
    open: ListingStateCopy
    /** Every check passing. Kept short — it's an acknowledgement, not a report. */
    complete: ListingStateCopy
  }
  /** The pre-filled email a region manager's "Contact manager" button opens. */
  contactManager: {
    subject: (eventTitle: string) => string
    body: (eventTitle: string, managerName: string) => string
  }
  variants: {
    manager: Record<ReminderLevel, VariantCopy>
    // Region managers are first looped in at `escalated`; there is no `due`.
    region: Partial<Record<ReminderLevel, VariantCopy>>
  }
} = {
  greeting: (name) => (
    <>
      Hello <strong>{name}</strong>,
    </>
  ),

  buttonHint: 'If the button doesn’t work, copy and paste this link into your browser:',

  footer: (audience, brandName) => (
    <>
      You’re receiving this because you manage{' '}
      {audience === 'region' ? 'this region' : 'this event'} on {brandName}. The links in this email
      are unique to you and acts on your behalf — please don’t forward this email.
    </>
  ),

  listing: {
    caption: (resolved, total) => `${resolved} of ${total} complete`,
    doneHeading: 'Already done',
    open: {
      heading: 'Improve your listing',
      intro: (
        <>
          These are optional and don’t affect verification — a fuller listing helps seekers find
          your class and know what to expect.
        </>
      ),
    },
    complete: {
      heading: 'Your listing is complete',
      intro: (
        <>Your event is optimized for seekers to find it. Thank you for keeping it up to date.</>
      ),
    },
  },

  contactManager: {
    subject: (eventTitle) => `Please verify your Sahaja Yoga class: ${eventTitle}`,
    body: (eventTitle, managerName) =>
      `Hello ${managerName},\n\nYour event “${eventTitle}” is going to be automatically unpublished soon if we don't check it. Could you verify it from your reminder email, or let me know if it is no longer running?\n\nThank you.`,
  },

  variants: {
    manager: {
      due: {
        heading: 'Verify your Sahaja Yoga class',
        preview: 'A quick check that your class is still running.',
        cta: 'Verify this event',
        body: ({ brandName }) => (
          <>
            To keep public listings accurate, {brandName} events need to be checked periodically.
            Events which are not verified are automatically unpublished. Please verify the details
            of your class below.
          </>
        ),
        callout: ({ deadline }) => <>✅ Verify by {deadline} to keep this event published.</>,
      },
      escalated: {
        heading: 'Sahaja Yoga class still needs verification',
        preview: 'Your event is overdue for verification.',
        cta: 'Verify now',
        body: () => (
          <>
            This is a reminder that your event still needs verification. Please check the details
            below and verify now.
          </>
        ),
        callout: ({ deadline }) => <>⏰ Verify by {deadline} or this event will be unpublished.</>,
      },
      urgent: {
        heading: 'Final reminder: verify your Sahaja Yoga class',
        preview: 'Last reminder before your class is unpublished.',
        cta: 'Verify now',
        body: () => (
          <>
            This is the final reminder to verify your event. Please check the details below and
            verify it immediately.
          </>
        ),
        callout: ({ deadline }) => (
          <>⚠️ Final reminder — verify by {deadline} or this event will be unpublished.</>
        ),
      },
      expired: {
        heading: 'Your Sahaja Yoga class has been unpublished',
        preview: 'Your unverified event is now hidden from the public.',
        cta: 'Verify to restore',
        body: ({ sinceLastVerified }) => (
          <>
            Your event wasn’t verified in over {sinceLastVerified}, so it has been hidden from the
            public. If this event is still running, please verify the details below to immediately
            republish the event.
          </>
        ),
        callout: ({ deadline }) => <>🚫 Unpublished on {deadline}. Verify now to republish.</>,
      },
    },

    region: {
      escalated: {
        heading: 'Event manager not responding',
        preview: 'Please contact the event manager to verify their event.',
        cta: 'Contact manager',
        body: ({ manager, region }) => (
          <>
            The following event in {region} needs verification, but the event manager has not yet
            responded. Please reach out to {manager} and confirm if it’s still running.
          </>
        ),
        callout: ({ deadline }) => (
          <>
            ⏰ Contact the manager. They must verify by {deadline} or this event will be
            unpublished.
          </>
        ),
      },
      urgent: {
        heading: 'Event will soon be unpublished',
        preview: 'Last notice before an event in your region is unpublished.',
        cta: 'Contact manager',
        body: ({ manager, region }) => (
          <>
            An event in {region} still needs verification, and its manager hasn’t responded to
            earlier reminders. Please get in touch with {manager} to check on it.
          </>
        ),
        callout: ({ deadline }) => (
          <>
            ⚠️ Final notice — contact the manager. They must verify by {deadline} or this event will
            be unpublished.
          </>
        ),
      },
      expired: {
        heading: 'Event has been unpublished',
        preview: 'An unverified event in your region is now hidden.',
        cta: 'Contact manager',
        body: ({ manager, region, sinceLastVerified }) => (
          <>
            An event in {region} was unpublished after going unverified for {sinceLastVerified}. If
            it’s still running, please contact {manager} and ask them to verify the event.
          </>
        ),
        callout: ({ deadline }) => (
          <>🚫 Unpublished on {deadline}. Contact the manager to republish.</>
        ),
      },
    },
  },
}

// One colour per level — calm at `due`, escalating to red once unpublished.
const CALLOUT_COLORS: Record<ReminderLevel, { bg: string; border: string }> = {
  due: { bg: '#eef5fc', border: '#4a8cd4' },
  escalated: { bg: '#fff8e6', border: '#f0b429' },
  urgent: { bg: '#fff4e5', border: '#f59e0b' },
  expired: { bg: '#fdecea', border: '#ef4444' },
}

/** Look up a variation's copy, throwing for unsupported combinations (region/due). */
function getVariant(audience: ReminderAudience, level: ReminderLevel): VariantCopy {
  const variant = COPY.variants[audience][level]
  if (!variant) {
    throw new Error(
      `EventVerificationEmail: the "${level}" reminder is not supported for ${audience} recipients`,
    )
  }
  return variant
}

/**
 * The already-passing checks, as ticked lines. Shared by both listing states,
 * which differ only in indentation: the open state aligns them under the
 * `DetailRow` cells above, while the complete state sits inside a padded box
 * that supplies the same inset.
 *
 * `label` is the check's `passedLabel` — a tick beside an imperative ("Take
 * the address out") reads as an endorsement of leaving it in.
 */
function renderDoneTicks(
  done: EventListingProgress['done'],
  color: string,
  style: CSSProperties,
): ReactNode {
  return done.map((item) => (
    <Text key={item.key} style={style}>
      <span style={{ color, fontWeight: 700 }}>✓</span> {item.label}
    </Text>
  ))
}

/** mailto a region manager uses to reach the event manager (the region CTA). */
function contactManagerHref(email: string, eventTitle: string, managerName: string): string {
  const subject = COPY.contactManager.subject(eventTitle)
  const body = COPY.contactManager.body(eventTitle, managerName)
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/**
 * Event verification email — the escalating nudge the ExpireEvents job sends as
 * an event ages `verified → reminded → escalated → urgent → expired`. All
 * wording lives in `COPY` above; this component only wires the chosen variation
 * to the layout, the summary tables, and the tokenized verify button. Region
 * managers (looped in from `escalated`) get region-framed copy plus the event
 * manager's contacts so they can follow up.
 */
export function EventVerificationEmail({
  name,
  eventTitle,
  verifyUrl,
  eventUrl,
  level,
  audience,
  deadline,
  sinceLastVerified,
  details,
  listingProgress,
  regionName,
  eventManager,
  project = 'sahaj-atlas',
}: EventVerificationEmailProps) {
  const brand = getEmailBrand(project)
  const variant = getVariant(audience, level)
  const calloutColor = CALLOUT_COLORS[level]
  const isUrl = details ? /^https?:\/\//.test(details.location) : false
  const vars: CopyVars = {
    title: <strong>{eventTitle}</strong>,
    manager: <strong>{eventManager?.name ?? 'the event manager'}</strong>,
    brandName: brand.productName,
    deadline: deadline ? <strong>{deadline}</strong> : 'shortly',
    region: <strong>{regionName ?? 'your region'}</strong>,
    sinceLastVerified,
  }

  // Shown to the event's own manager only. A region manager is here to nudge
  // someone else into verifying — handing them a list of that volunteer's
  // shortcomings sours a conversation they can't act on themselves.
  //
  // A `total` of 0 would mean every check bowed out (see `requiresHandWrittenTitle`
  // / `skipWhenFailed`), which leaves nothing to be a fraction of — suppress
  // rather than render "0 of 0 complete" and an empty bar.
  const progress = audience === 'manager' && listingProgress?.total ? listingProgress : null
  const hasOpen = (progress?.open.length ?? 0) > 0
  const listingCopy = hasOpen ? COPY.listing.open : COPY.listing.complete

  // Region managers don't verify (they may lack the details); their CTA emails
  // the event manager instead. Everyone else gets the tokenized verify link.
  const contactEmail = eventManager?.contacts.find((entry) => entry.label === 'Email')?.value
  const ctaHref =
    audience === 'region' && contactEmail
      ? contactManagerHref(contactEmail, eventTitle, eventManager?.name ?? 'there')
      : verifyUrl

  return (
    <EmailLayout brand={brand} heading={variant.heading} previewText={variant.preview}>
      <Text style={styles.paragraph}>{COPY.greeting(name)}</Text>
      <Text style={styles.paragraph}>{variant.body(vars)}</Text>

      <Section
        style={{
          backgroundColor: calloutColor.bg,
          borderLeft: `4px solid ${calloutColor.border}`,
          borderRadius: '4px',
          padding: '12px 14px',
          margin: '4px 0 16px',
          fontSize: '14px',
          color: '#1f2937',
          lineHeight: 1.5,
        }}
      >
        {variant.callout(vars)}
      </Section>

      {audience === 'region' && eventManager ? (
        <Section>
          <SectionHeading>Event manager</SectionHeading>
          <DetailRow label="Name">{eventManager.name}</DetailRow>
          {eventManager.contacts.map((entry) => (
            <DetailRow key={entry.label} label={entry.label}>
              {entry.value}
            </DetailRow>
          ))}
        </Section>
      ) : null}

      {details ? (
        <Section>
          <SectionHeading>Event details</SectionHeading>
          <DetailRow label="Event">{details.title}</DetailRow>
          {details.location ? (
            <DetailRow label={details.locationLabel}>
              {isUrl ? (
                <Link
                  href={details.location}
                  style={{ ...styles.link, color: brand.colors.primary }}
                >
                  {details.location}
                </Link>
              ) : (
                details.location
              )}
            </DetailRow>
          ) : null}
          {details.schedule ? <DetailRow label="Schedule">{details.schedule}</DetailRow> : null}
          {details.breaks && details.breaks.length > 0 ? (
            <DetailRow label="Scheduled breaks">
              {details.breaks.map((line, index) => (
                <span key={index}>
                  {line}
                  {index < details.breaks!.length - 1 ? <br /> : null}
                </span>
              ))}
            </DetailRow>
          ) : null}
          {details.contact ? <DetailRow label="Contact">{details.contact}</DetailRow> : null}
          {typeof details.recentRegistrations === 'number' ? (
            <DetailRow label="Registrations">
              {`${details.recentRegistrations} registration${
                details.recentRegistrations === 1 ? '' : 's'
              } in the last 30 days`}
            </DetailRow>
          ) : null}
          <DetailRow label="Last verified">{details.lastVerified}</DetailRow>
        </Section>
      ) : null}

      {progress ? (
        hasOpen ? (
          <Section>
            <SectionHeading>{listingCopy.heading}</SectionHeading>
            <ProgressBar
              resolved={progress.resolved}
              total={progress.total}
              color={brand.colors.primary}
              caption={COPY.listing.caption(progress.resolved, progress.total)}
            />
            <Text style={styles.hint}>{listingCopy.intro}</Text>
            {/* Every open item, uncapped: the registry is deliberately coarse
                and two of its four checks are mutually exclusive, so at most
                three can be open at once — never enough to read as a scolding. */}
            {progress.open.map((suggestion) => (
              <DetailRow key={suggestion.key} label={suggestion.label}>
                {suggestion.detail}
              </DetailRow>
            ))}
            {/* Only with ticks beneath it — a listing that passes nothing yet
                would otherwise get an "Already done" heading over thin air. */}
            {progress.done.length > 0 ? (
              <>
                <Text style={{ ...styles.hint, margin: '18px 0 4px', fontWeight: 600 }}>
                  {COPY.listing.doneHeading}
                </Text>
                {renderDoneTicks(progress.done, brand.colors.primary, doneItemIndented)}
              </>
            ) : null}
          </Section>
        ) : (
          // Complete: no bar, boxed. A full-width bar would only restate the
          // word "complete", and the ticks name every check it would have
          // counted — but without the bar or a `SectionHeading` the note needs
          // the box to read as its own thing rather than as more event details.
          <Section style={completeCallout}>
            <Text style={completeHeading}>{listingCopy.heading}</Text>
            <Text style={{ ...styles.hint, margin: '0 0 8px' }}>{listingCopy.intro}</Text>
            {renderDoneTicks(progress.done, brand.colors.primary, doneItem)}
          </Section>
        )
      ) : null}

      <BrandButton href={ctaHref} brand={brand}>
        {variant.cta}
      </BrandButton>
      {eventUrl ? (
        <BrandButton href={eventUrl} brand={brand} variant="secondary" tight>
          View event
        </BrandButton>
      ) : null}
      {audience === 'region' ? null : (
        <Text style={styles.hint}>
          {COPY.buttonHint}
          <br />
          <Link href={verifyUrl} style={{ ...styles.link, color: brand.colors.primary }}>
            {verifyUrl}
          </Link>
        </Text>
      )}
      <Hr style={styles.hr} />
      <Text style={styles.footer}>{COPY.footer(audience, brand.productName)}</Text>
    </EmailLayout>
  )
}
