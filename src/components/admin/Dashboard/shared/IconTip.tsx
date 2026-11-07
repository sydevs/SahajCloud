'use client'

import type { LucideIcon } from 'lucide-react'

import styles from './Dashboard.module.css'
import { HoverTooltip } from '../../AtlasNav/HoverTooltip'

/**
 * A glyph naming what a row is, with the name on hover. Positioned above a
 * cell's stretched link (`styles.stretched`), so the tooltip can be hovered.
 */
export function IconTip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className={styles.iconTip}>
      <HoverTooltip text={label}>
        <Icon aria-label={label} role="img" size={16} />
      </HoverTooltip>
    </span>
  )
}
