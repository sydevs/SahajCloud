import React from 'react'

import styles from './SummaryCard.module.css'

export interface SummaryCardItem {
  label: React.ReactNode
  value: React.ReactNode
}

/**
 * A bordered, read-only summary: label and value pairs, anything below them,
 * and a link to where they are changed — for a tab that shows what another
 * view owns rather than offering a second place to edit it.
 */
export function SummaryCard({
  items,
  children,
  link,
}: {
  items: SummaryCardItem[]
  children?: React.ReactNode
  link?: { href: string; label: React.ReactNode }
}): React.ReactElement {
  return (
    <div className={styles.card}>
      <dl className={styles.list}>
        {items.map((item, index) => (
          <React.Fragment key={index}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </React.Fragment>
        ))}
      </dl>
      {children}
      {link ? (
        <a className={styles.link} href={link.href}>
          {link.label}
        </a>
      ) : null}
    </div>
  )
}
