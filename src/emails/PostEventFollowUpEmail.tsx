import type { ReactNode } from 'react'

import { Section, Text } from 'react-email'

import type { EmailStrings } from '@/lib/translations/emailStrings'
import { interpolate } from '@/lib/translations/emailStrings'
import type { EmailBrand } from '@/plugins/email'

import { BrandButtonRow, EmailLayout, SectionHeading, styles } from './EmailLayout'

/**
 * Composable content blocks for the post-event follow-up email, so future
 * follow-up content (feedback forms, event/program promotion) slots in as new
 * section types without reshaping the job or the template.
 */
export type FollowUpSection =
  | {
      type: 'feedback-ask'
      /** "Yes, it took place" link (the feedback page, vote preselected). */
      confirmUrl: string
      /** "No such event" link. */
      denyUrl: string
    }
  | {
      type: 'text'
      heading?: string
      body: string
    }

export interface PostEventFollowUpEmailProps {
  brand: EmailBrand
  /** Resolved in the registrant's locale by the sender — never queried here. */
  strings: EmailStrings
  registrantName: string
  eventTitle: string
  sections: FollowUpSection[]
}

function renderSection(
  brand: EmailBrand,
  strings: EmailStrings,
  section: FollowUpSection,
  index: number,
): ReactNode {
  switch (section.type) {
    case 'feedback-ask':
      return (
        <Section key={index}>
          <Text style={styles.paragraph}>{strings.followup_ask}</Text>
          <BrandButtonRow
            brand={brand}
            buttons={[
              { label: strings.followup_confirm_cta, href: section.confirmUrl },
              {
                label: strings.followup_deny_cta,
                href: section.denyUrl,
                variant: 'secondary',
              },
            ]}
          />
        </Section>
      )
    case 'text':
      return (
        <Section key={index}>
          {section.heading ? <SectionHeading>{section.heading}</SectionHeading> : null}
          <Text style={styles.paragraph}>{section.body}</Text>
        </Section>
      )
  }
}

/**
 * Post-event follow-up to a registrant — sent once per registration (the
 * `followUpSentAt` watermark) after the occurrence they registered for has
 * passed. Today it carries the confirm/deny ask for unverified events; the
 * sections prop is the extension point for future follow-up content.
 *
 * Registrant mail, so it follows that shape: no callout, the **client
 * service's** brand rather than the project's, and every string resolved in
 * the registrant's own locale by the sender (see `src/plugins/email/AGENTS.md`).
 */
export function PostEventFollowUpEmail({
  brand,
  strings,
  registrantName,
  eventTitle,
  sections,
}: PostEventFollowUpEmailProps) {
  const heading = interpolate(strings.followup_heading, { event: eventTitle })
  return (
    <EmailLayout brand={brand} heading={heading} previewText={heading}>
      <Text style={styles.paragraph}>
        {interpolate(strings.followup_intro, { name: registrantName, event: eventTitle })}
      </Text>
      {sections.map((section, index) => renderSection(brand, strings, section, index))}
      <Text style={styles.hint}>{strings.followup_footer_reason}</Text>
    </EmailLayout>
  )
}

/**
 * Plain-text alternative. Every registrant template ships one: a message with
 * no text part scores worse with spam filters and renders as nothing at all in
 * a text-only client.
 */
export function postEventFollowUpText({
  strings,
  registrantName,
  eventTitle,
  sections,
}: PostEventFollowUpEmailProps): string {
  const lines: string[] = [
    interpolate(strings.followup_heading, { event: eventTitle }),
    '',
    interpolate(strings.followup_intro, { name: registrantName, event: eventTitle }),
  ]

  for (const section of sections) {
    lines.push('')
    if (section.type === 'feedback-ask') {
      lines.push(
        strings.followup_ask,
        '',
        `${strings.followup_confirm_cta}: ${section.confirmUrl}`,
        `${strings.followup_deny_cta}: ${section.denyUrl}`,
      )
    } else {
      if (section.heading) lines.push(section.heading)
      lines.push(section.body)
    }
  }

  lines.push('', strings.followup_footer_reason)
  return lines.join('\n')
}

export default PostEventFollowUpEmail
