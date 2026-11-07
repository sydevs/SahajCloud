'use client'

import type { DashboardSection } from './model'

import { CheckIcon } from '@payloadcms/ui'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

import type { OverviewProgress } from '@/lib/atlasOverview/status'

import styles from './Dashboard.module.css'
import { sectionHref } from './model'
import { Count } from '../../helpers/listControls'

export interface SectionTab {
  /** `null` hides the count — a section that is not a to-do list. */
  count: null | number
  label: string
  value: DashboardSection
}

/**
 * A home's section tabs, in the Tabs field's look, with the progress meter at
 * the row's far end.
 *
 * ⚠ **Links carrying Payload's tab classes, not `TabComponent`**, which renders
 * `WatchChildErrors` and needs a `Form`. A lone tab still renders: it is where
 * the program home shows its count, or the tick standing in for zero.
 */
export function SectionTabs({
  active,
  progress,
  tabs,
}: {
  active: DashboardSection
  /** `null` for an admin, whose list is no one's workload. */
  progress: null | OverviewProgress
  tabs: SectionTab[]
}) {
  const search = useSearchParams()?.toString() ?? ''
  return (
    <div className={`tabs-field__tabs ${styles.sections}`}>
      <div className={styles.tabList} role="tablist">
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
              <Count value={tab.count} />
            )}
          </Link>
        ))}
      </div>
      {/* ⚠ A native `<meter>` carries the value to assistive technology, and
          Payload's `ProgressBar` is the route-transition bar. `max` is never
          zero: an empty scope is 100% on track. */}
      {progress && (
        <div className={styles.meter}>
          <meter
            aria-label="Progress"
            high={99}
            low={60}
            max={100}
            optimum={100}
            value={progress.percent}
          />
          <span>{progress.label}</span>
        </div>
      )}
    </div>
  )
}
