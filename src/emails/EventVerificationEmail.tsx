import type { ReactNode } from 'react'

import { Fragment } from 'react'
import { Hr, Link, Section, Text } from 'react-email'

import type { LocaleCode } from '@/lib/locales'
import { type EmailStrings, interpolate, pluralize } from '@/lib/translations/emailStrings'
import type { ProjectSlug } from '@/payload-types'
import { getEmailBrand } from '@/plugins/email'

import { BrandButton, DetailRow, EmailLayout, SectionHeading, styles } from './EmailLayout'

/** Escalation level → email copy. Mirrors the job's reminder stages. */
export type ReminderLevel = 'due' | 'escalated' | 'urgent' | 'expired'

/** Who the reminder is going to — its manager, or a region manager above it. */
export type ReminderAudience = 'manager' | 'region'

/** Levels a region manager sees — they're escalated to, so never at `due`. */
type RegionLevel = Exclude<ReminderLevel, 'due'>

/** The slots one variation's copy fills. */
type VariantSlot = 'subject' | 'heading' | 'preview' | 'cta' | 'body' | 'callout'

/**
 * Translation keys the audience × level matrix can address — deliberately
 * ragged. Indexing `strings` with this union is what makes a key missing from
 * `EMAIL_STRING_DEFAULTS` a compile error rather than a blank line in an email.
 */
type VariantKey =
  | `verify_manager_${ReminderLevel}_${VariantSlot}`
  | `verify_region_${RegionLevel}_${VariantSlot}`

/** Key event facts shown in the email so the manager can verify at a glance. */
export interface EventDetails {
  title: string
  /** Whether `location` is a joining URL rather than a street address. */
  isOnline: boolean
  /** One-line address, or the online URL. */
  location: string
  /** One-line schedule summary. */
  schedule: string
  /** Contact name · phone, when set. */
  contact?: string
  /** Formatted scheduled-break lines, when any. */
  breaks?: string[]
  /** Date the event was last verified; `null` when it never has been. */
  lastVerified: string | null
  /** Registrations in the last 30 days — omitted when there are none. */
  recentRegistrations?: number
}

/** The event manager's contact card, shown to region managers. */
export interface EventManagerContact {
  name: string
  contacts: { label: string; value: string }[]
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
  /** Localized copy, pre-resolved for the recipient — a template never queries. */
  strings: EmailStrings
  /** Recipient's locale — drives plural-form selection (the registration count). */
  locale?: LocaleCode | null
  /** Formatted date the event is / was unpublished. */
  deadline?: string
  /** Human duration the event has gone unverified. */
  sinceLastVerified: string
  /** Key event facts (rendered as a summary table). */
  details?: EventDetails
  /** The ancestor region linking a region manager to the event (region audience). */
  regionName?: string
  /** Event manager's contacts — shown to region managers so they can reach out. */
  eventManager?: EventManagerContact
  /** Project to brand for. Defaults to `sahaj-atlas` (events are Atlas). */
  project?: ProjectSlug
}

// One colour per level — calm at `due`, escalating to red once unpublished.
const CALLOUT_COLORS: Record<ReminderLevel, { bg: string; border: string }> = {
  due: { bg: '#eef5fc', border: '#4a8cd4' },
  escalated: { bg: '#fff8e6', border: '#f0b429' },
  urgent: { bg: '#fff4e5', border: '#f59e0b' },
  expired: { bg: '#fdecea', border: '#ef4444' },
}

/** Key for one slot of a variation, or `null` for the unsupported region/due. */
function variantKey(
  audience: ReminderAudience,
  level: ReminderLevel,
  slot: VariantSlot,
): VariantKey | null {
  if (audience === 'region') {
    if (level === 'due') return null
    return `verify_region_${level}_${slot}`
  }
  return `verify_manager_${level}_${slot}`
}

/** One slot of a variation's copy, throwing for unsupported combinations. */
function variantString(
  strings: EmailStrings,
  audience: ReminderAudience,
  level: ReminderLevel,
  slot: VariantSlot,
): string {
  const key = variantKey(audience, level, slot)
  if (!key) {
    throw new Error(
      `EventVerificationEmail: the "${level}" reminder is not supported for ${audience} recipients`,
    )
  }
  return strings[key]
}

/**
 * The localized subject line for one variation, so the send path doesn't have
 * to know how the copy is keyed. Throws for region/due, exactly as render does.
 */
export function verificationSubject(args: {
  strings: EmailStrings
  audience: ReminderAudience
  level: ReminderLevel
  eventTitle: string
}): string {
  const { strings, audience, level, eventTitle } = args
  return interpolate(variantString(strings, audience, level, 'subject'), { event: eventTitle })
}

/**
 * Interpolate `%{...}` placeholders with ReactNodes, so a value can carry markup
 * — the deadline, region and manager name render bold inside the sentence.
 * Placeholders rather than concatenation are what let a translator move a value
 * to wherever their language puts it. `interpolate()` is the plain-string
 * equivalent, for a subject or a mailto body. An unknown placeholder is left
 * intact so a copy mistake is visible in the rendered email.
 */
function interpolateNodes(template: string, values: Record<string, ReactNode>): ReactNode {
  return template.split(/(%\{\w+\})/g).map((part, index) => {
    const key = /^%\{(\w+)\}$/.exec(part)?.[1]
    if (key === undefined || !(key in values)) return part
    return <Fragment key={index}>{values[key]}</Fragment>
  })
}

/** mailto a region manager uses to reach the event manager (the region CTA). */
function contactManagerHref(
  strings: EmailStrings,
  email: string,
  eventTitle: string,
  managerName: string,
): string {
  const subject = interpolate(strings.verify_contact_subject, { event: eventTitle })
  const body = interpolate(strings.verify_contact_body, { event: eventTitle, manager: managerName })
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/**
 * Event verification email — the escalating nudge the ExpireEvents job sends as
 * an event ages `verified → reminded → escalated → urgent → expired`. Every
 * word comes from the `emails` group of the `sy-atlas-translations` global,
 * resolved for the recipient's own language before render (`resolveEmailStrings`
 * off `Managers.language`); this component only wires the chosen variation to
 * the layout, the summary tables, and the tokenized verify button. Region
 * managers (looped in from `escalated`) get region-framed copy plus the event
 * manager's contacts so they can follow up.
 *
 * The event facts themselves — schedule phrase, dates, how long it has gone
 * unverified — arrive pre-formatted in English from `buildEventEmailDetails`:
 * as the translations group puts it, event data is never translated.
 */
export function EventVerificationEmail({
  name,
  eventTitle,
  verifyUrl,
  eventUrl,
  level,
  audience,
  strings,
  locale,
  deadline,
  sinceLastVerified,
  details,
  regionName,
  eventManager,
  project = 'sahaj-atlas',
}: EventVerificationEmailProps) {
  const brand = getEmailBrand(project)
  const copy = (slot: VariantSlot) => variantString(strings, audience, level, slot)
  const calloutColor = CALLOUT_COLORS[level]
  const isUrl = details ? /^https?:\/\//.test(details.location) : false
  const vars: Record<string, ReactNode> = {
    brand: brand.productName,
    deadline: deadline ? <strong>{deadline}</strong> : strings.verify_fallback_deadline,
    manager: <strong>{eventManager?.name ?? strings.verify_fallback_manager}</strong>,
    region: <strong>{regionName ?? strings.verify_fallback_region}</strong>,
    since: sinceLastVerified,
  }

  // Region managers don't verify (they may lack the details); their CTA emails
  // the event manager instead. Everyone else gets the tokenized verify link.
  const contactEmail = eventManager?.contacts.find((entry) => entry.label === 'Email')?.value
  const ctaHref =
    audience === 'region' && eventManager && contactEmail
      ? contactManagerHref(strings, contactEmail, eventTitle, eventManager.name)
      : verifyUrl

  return (
    <EmailLayout brand={brand} heading={copy('heading')} previewText={copy('preview')}>
      <Text style={styles.paragraph}>
        {interpolateNodes(strings.verify_greeting, { name: <strong>{name}</strong> })}
      </Text>
      <Text style={styles.paragraph}>{interpolateNodes(copy('body'), vars)}</Text>

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
        {interpolateNodes(copy('callout'), vars)}
      </Section>

      {audience === 'region' && eventManager ? (
        <Section>
          <SectionHeading>{strings.verify_manager_heading}</SectionHeading>
          <DetailRow label={strings.verify_label_name}>{eventManager.name}</DetailRow>
          {eventManager.contacts.map((entry) => (
            <DetailRow key={entry.label} label={entry.label}>
              {entry.value}
            </DetailRow>
          ))}
        </Section>
      ) : null}

      {details ? (
        <Section>
          <SectionHeading>{strings.verify_details_heading}</SectionHeading>
          <DetailRow label={strings.verify_label_event}>{details.title}</DetailRow>
          {details.location ? (
            <DetailRow
              label={details.isOnline ? strings.verify_label_online : strings.verify_label_address}
            >
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
          {details.schedule ? (
            <DetailRow label={strings.verify_label_schedule}>{details.schedule}</DetailRow>
          ) : null}
          {details.breaks && details.breaks.length > 0 ? (
            <DetailRow label={strings.verify_label_breaks}>
              {details.breaks.map((line, index) => (
                <span key={index}>
                  {line}
                  {index < details.breaks!.length - 1 ? <br /> : null}
                </span>
              ))}
            </DetailRow>
          ) : null}
          {details.contact ? (
            <DetailRow label={strings.verify_label_contact}>{details.contact}</DetailRow>
          ) : null}
          {typeof details.recentRegistrations === 'number' ? (
            <DetailRow label={strings.verify_label_registrations}>
              {pluralize(
                strings,
                'verify_registrations_count',
                details.recentRegistrations,
                locale,
              )}
            </DetailRow>
          ) : null}
          <DetailRow label={strings.verify_label_last_verified}>
            {details.lastVerified ?? strings.verify_never_verified}
          </DetailRow>
        </Section>
      ) : null}

      <BrandButton href={ctaHref} brand={brand}>
        {copy('cta')}
      </BrandButton>
      {eventUrl ? (
        <BrandButton href={eventUrl} brand={brand} variant="secondary" tight>
          {strings.verify_view_event_cta}
        </BrandButton>
      ) : null}
      {audience === 'region' ? null : (
        <Text style={styles.hint}>
          {strings.verify_button_hint}
          <br />
          <Link href={verifyUrl} style={{ ...styles.link, color: brand.colors.primary }}>
            {verifyUrl}
          </Link>
        </Text>
      )}
      <Hr style={styles.hr} />
      <Text style={styles.footer}>
        {interpolate(
          audience === 'region' ? strings.verify_footer_region : strings.verify_footer_manager,
          { brand: brand.productName },
        )}
      </Text>
    </EmailLayout>
  )
}
