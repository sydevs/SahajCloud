import type { OverviewProgress } from '@/lib/atlasOverview/status'

import styles from './Dashboard.module.css'

/**
 * How much of the scope is on track.
 *
 * ⚠ **A native `<meter>`, not a styled div.** It carries the value to
 * assistive technology, which no div does, and `@payloadcms/ui`'s own
 * `ProgressBar` cannot help: it is the route-transition bar, takes no props
 * and reads its value from `RouteTransitionProvider` (`docs/rules/admin-ui.md`).
 *
 * `max` is never zero — an empty scope is 100% on track, and `max={0}` is
 * invalid markup.
 */
export function ProgressMeter({ progress }: { progress: OverviewProgress }) {
  return (
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
  )
}
