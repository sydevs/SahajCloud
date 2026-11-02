'use client'

import { Button } from '@payloadcms/ui'

import styles from './FilterTabs.module.css'

export type FilterTab<T extends string> = { value: T; label: string; count?: number }

/**
 * The row of tab buttons an admin view filters a list with.
 *
 * One definition of the convention: the selected tab is `subtle` rather than
 * `tab`, and it carries `aria-pressed` plus `aria-controls` naming the region
 * it filters — a toggle group, which is what this is, is not a link set, and a
 * screen reader has no other way to know which tab is on.
 */
export function FilterTabs<T extends string>({
  controls,
  label,
  onSelect,
  selected,
  tabs,
}: {
  /** The `id` of the region these tabs filter. */
  controls: string
  label: string
  onSelect: (value: T) => void
  selected: T
  tabs: FilterTab<T>[]
}) {
  return (
    <div className={styles.filters} role="group" aria-label={label}>
      {tabs.map((tab) => (
        <Button
          key={tab.value}
          margin={false}
          buttonStyle={selected === tab.value ? 'subtle' : 'tab'}
          size="medium"
          onClick={() => onSelect(tab.value)}
          extraButtonProps={{ 'aria-pressed': selected === tab.value, 'aria-controls': controls }}
        >
          {tab.label}
          {tab.count !== undefined && <span className={styles.count}>{tab.count}</span>}
        </Button>
      ))}
    </div>
  )
}
