'use client'

import { Button } from '@payloadcms/ui'
import React from 'react'

import styles from './labelWithAction.module.css'

/**
 * A field's heading with one quiet text action beside it — Regions' "Import
 * classes", the Atlas tab's "Reset colors". The heading is the caller's own, so
 * a group keeps Payload's group title and a join keeps its field label.
 *
 * Only the look is shared. When each action shows, and what it does, stays with
 * its label: the two answer different questions (a permission and a region
 * level; whether any colour is the service's own).
 */
export function LabelWithAction({
  action,
  children,
  onClick,
  to,
}: {
  action: string
  children: React.ReactNode
  onClick?: () => void
  to?: string
}) {
  return (
    <div className={styles.row}>
      {children}
      <Button
        buttonStyle="none"
        className={styles.action}
        el={to ? 'link' : 'button'}
        margin={false}
        onClick={onClick}
        to={to}
      >
        {action}
      </Button>
    </div>
  )
}
