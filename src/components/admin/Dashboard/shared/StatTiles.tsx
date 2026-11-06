import { changeLabel } from '@/lib/atlasOverview/filters'
import type { StatTile } from '@/lib/atlasOverview/statistics'

import styles from './Dashboard.module.css'

/**
 * The home's statistics: flat tiles, not `Card`s, which read as something to
 * open and competed with the list a reader acts on.
 *
 * ⚠ **A tile with no change line is not a tile showing zero.** `change: null`
 * means no snapshot from 30 days ago, and "+0" would claim the opposite.
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
