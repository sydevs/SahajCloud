'use client'

import type { DashboardSection } from './model'

import { CheckIcon, Pill } from '@payloadcms/ui'
import Link from 'next/link'

import styles from './Dashboard.module.css'

export interface SectionTab {
  /** `null` hides the count entirely — a section that is not a to-do list. */
  count?: null | number
  label: string
  value: DashboardSection
}

/**
 * A home's section tabs, in the Tabs field's own look.
 *
 * ⚠ **Links carrying Payload's tab classes, not `TabComponent`.** That
 * component renders `WatchChildErrors` and needs a `Form`, which a dashboard
 * does not have — so the markup is borrowed and the behaviour is a plain
 * navigation, which is also what makes each section a shareable URL.
 *
 * A count of zero draws the tick rather than "0": nothing open is the one
 * number worth saying differently.
 */
export function SectionTabs({ active, tabs }: { active: DashboardSection; tabs: SectionTab[] }) {
  // ⚠ **A lone tab still renders.** It is not navigation then, but it is still
  // where that section's count — or the tick standing in for zero — is shown,
  // which the program home has nowhere else to put. Refusing to draw one left
  // that home with no count and no tick at all.
  if (tabs.length === 0) return null
  return (
    <div className={`tabs-field__tabs ${styles.sections}`} role="tablist">
      {tabs.map((tab) => (
        <Link
          aria-selected={tab.value === active}
          className={[
            'tabs-field__tab-button',
            tab.value === active && 'tabs-field__tab-button--active',
          ]
            .filter(Boolean)
            .join(' ')}
          href={`?section=${tab.value}`}
          key={tab.value}
          prefetch={false}
          role="tab"
        >
          {tab.label}
          {tab.count === null || tab.count === undefined ? null : tab.count === 0 ? (
            <span className={styles.tabCheck}>
              <CheckIcon />
            </span>
          ) : (
            <Pill pillStyle="light-gray" rounded size="small">
              {tab.count}
            </Pill>
          )}
        </Link>
      ))}
    </div>
  )
}
