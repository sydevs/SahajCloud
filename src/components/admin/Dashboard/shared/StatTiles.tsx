import type { StatTile } from '@/lib/atlasOverview/statistics'
import { changeLabel } from '@/lib/atlasOverview/statistics'

import styles from './Dashboard.module.css'

/**
 * The home's statistics: flat tiles, no border and no radius.
 *
 * Replaces `CountCards`, which drew each count as a `Card` — a bordered,
 * clickable surface that read as something to open. These are numbers to
 * glance at: the list below is what a reader acts on, and a row of six cards
 * competed with it.
 *
 * ⚠ **A tile with no change line is not a tile showing zero.** `change: null`
 * means nothing can say — no snapshot from 30 days ago — and "+0" would claim
 * the opposite (`src/lib/atlasOverview/statistics.ts`).
 */
export function StatTiles({ label, tiles }: { label: string; tiles: StatTile[] }) {
  if (tiles.length === 0) return null
  return (
    <ul aria-label={label} className={styles.tiles}>
      {tiles.map((tile) => (
        <li key={tile.key}>
          <span className={styles.tileLabel}>{tile.label}</span>
          <span className={styles.tileValue}>
            {tile.value}
            {tile.of === undefined ? null : <small> of {tile.of}</small>}
          </span>
          {tile.change === null ? null : (
            <span className={styles.tileChange}>{changeLabel(tile.change)}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
