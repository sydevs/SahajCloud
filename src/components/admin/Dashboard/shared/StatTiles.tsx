import Link from 'next/link'
import { useId } from 'react'

import { changeLabel } from '@/lib/atlasOverview/filters'
import type { StatTile } from '@/lib/atlasOverview/statistics'

import styles from './Dashboard.module.css'

/**
 * A titled group of the home's statistics: flat tiles, not `Card`s, which read
 * as something to open and competed with the list a reader acts on. A tile
 * with a `path` opens the list of what it counts.
 *
 * ⚠ **A tile with no change line is not a tile showing zero.** `change: null`
 * means no snapshot from 30 days ago, and "+0" would claim the opposite.
 */
export function StatTiles({ label, tiles }: { label: string; tiles: StatTile[] }) {
  const headingId = useId()
  if (tiles.length === 0) return null
  return (
    <section aria-labelledby={headingId} className={styles.tileGroup}>
      <h2 className={styles.tilesHeading} id={headingId}>
        {label}
      </h2>
      <ul className={styles.tiles}>
        {tiles.map((tile) => {
          const body = (
            <>
              <span className={styles.tileLabel}>{tile.label}</span>
              <span className={styles.tileValue}>
                {tile.value}
                {tile.of === undefined ? null : <small> of {tile.of}</small>}
              </span>
              {/* Always rendered, so a tile with no change line keeps the row's height. */}
              <span className={styles.tileChange}>
                {tile.change === null ? null : changeLabel(tile.change)}
              </span>
            </>
          )
          return (
            <li key={tile.key}>
              {tile.path ? (
                <Link className={styles.tileLink} href={`/admin${tile.path}`} prefetch={false}>
                  {body}
                </Link>
              ) : (
                <div className={styles.tileLink}>{body}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
