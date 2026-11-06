'use client'

import type { DashboardSection } from './model'

import { CheckIcon, Pill } from '@payloadcms/ui'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import styles from './Dashboard.module.css'
import { sectionHref } from './model'

export interface SectionTab {
  /** `null` hides the count — a section that is not a to-do list. */
  count: null | number
  label: string
  value: DashboardSection
}

/**
 * A home's section tabs, in the Tabs field's look.
 *
 * ⚠ **Links carrying Payload's tab classes, not `TabComponent`**, which renders
 * `WatchChildErrors` and needs a `Form`. A lone tab still renders: it is where
 * the program home shows its count, or the tick standing in for zero.
 */
export function SectionTabs({ active, tabs }: { active: DashboardSection; tabs: SectionTab[] }) {
  const search = useSearchParams()?.toString() ?? ''
  return (
    <div className={`tabs-field__tabs ${styles.sections}`} role="tablist">
      {tabs.map((tab) => (
        <Link
          aria-selected={tab.value === active}
          className={
            tab.value === active
              ? 'tabs-field__tab-button tabs-field__tab-button--active'
              : 'tabs-field__tab-button'
          }
          href={sectionHref(search, tab.value)}
          key={tab.value}
          prefetch={false}
          role="tab"
        >
          {tab.label}
          {tab.count === null ? null : tab.count === 0 ? (
            <span className={styles.tick}>
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
