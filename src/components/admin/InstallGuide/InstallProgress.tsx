'use client'

import type { Milestone, MilestoneState } from './installModel'

import { Pill, Table } from '@payloadcms/ui'
import React from 'react'

import { Progress } from '@/components/admin/helpers/Progress'
import { tableColumn } from '@/components/admin/helpers/tableColumn'

import styles from './InstallGuide.module.css'
import { installProgress } from './installModel'

const PILL_STYLE: Record<MilestoneState, React.ComponentProps<typeof Pill>['pillStyle']> = {
  done: 'success',
  failed: 'error',
  todo: 'light-gray',
  na: 'light-gray',
}

/** The sidebar's progress: a count, a bar, and one row per milestone. */
export function InstallProgress({ milestones }: { milestones: Milestone[] }): React.ReactElement {
  return (
    <div className={styles.progress}>
      <InstallProgressBar milestones={milestones} />
      <Table
        appearance="condensed"
        columns={[
          tableColumn(
            'milestone',
            'Milestone',
            milestones.map((milestone) => (
              <span key={milestone.id}>
                <span
                  className={milestone.state === 'na' ? styles.milestoneNa : styles.milestoneLabel}
                >
                  {milestone.label}
                </span>
                {milestone.note ? (
                  <span className={styles.milestoneNote}>{milestone.note}</span>
                ) : null}
              </span>
            )),
          ),
          tableColumn(
            'status',
            'Status',
            milestones.map((milestone) => (
              <Pill key={milestone.id} pillStyle={PILL_STYLE[milestone.state]} size="small">
                {milestone.status}
              </Pill>
            )),
          ),
        ]}
        data={milestones.map((milestone) => ({ id: milestone.id }))}
      />
    </div>
  )
}

/**
 * The count and the bar on their own, for a place that shows how far an install
 * has got without its table — the Atlas tab's summary. A row the site can never
 * finish is out of the count, as it is in the table.
 */
export function InstallProgressBar({
  milestones,
}: {
  milestones: Milestone[]
}): React.ReactElement {
  const { done, total } = installProgress(milestones)

  return (
    <div className={styles.progressHeader}>
      <span className={done === total ? styles.progressComplete : styles.progressCount}>
        {done === total ? 'Installation complete' : `${done} of ${total} done`}
      </span>
      <Progress label="Install progress" max={total} value={done} />
    </div>
  )
}
