import type { ReactNode } from 'react'

import { Section, Text } from 'react-email'

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

interface PostEventFollowUpEmailProps {
  brand: EmailBrand
  registrantName: string
  eventTitle: string
  sections: FollowUpSection[]
}

function renderSection(brand: EmailBrand, section: FollowUpSection, index: number): ReactNode {
  switch (section.type) {
    case 'feedback-ask':
      return (
        <Section key={index}>
          <Text style={styles.paragraph}>
            This listing hasn’t been verified by a local coordinator yet, so your answer really
            helps: did this class actually take place?
          </Text>
          <BrandButtonRow
            brand={brand}
            buttons={[
              { label: 'Yes, it took place', href: section.confirmUrl },
              { label: 'No — I couldn’t find it', href: section.denyUrl, variant: 'secondary' },
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
 * `followUpSentAt` ledger) after the occurrence they registered for has
 * passed. Today it carries the confirm/deny ask for unverified events; the
 * sections prop is the extension point for future follow-up content.
 */
export function PostEventFollowUpEmail({
  brand,
  registrantName,
  eventTitle,
  sections,
}: PostEventFollowUpEmailProps) {
  return (
    <EmailLayout
      brand={brand}
      heading={`How was “${eventTitle}”?`}
      previewText={`A quick question about ${eventTitle}`}
    >
      <Text style={styles.paragraph}>
        Hi {registrantName}, you recently registered for “{eventTitle}”.
      </Text>
      {sections.map((section, index) => renderSection(brand, section, index))}
    </EmailLayout>
  )
}

export default PostEventFollowUpEmail
