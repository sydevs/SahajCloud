'use client'

import type { Milestone, MilestoneState } from './installModel'

import { Table } from '@payloadcms/ui'
import React from 'react'

import { tableColumn } from '@/components/admin/helpers/tableColumn'

import styles from './InstallGuide.module.css'
import { installProgress } from './installModel'

const STATE_CLASS: Record<MilestoneState, string | undefined> = {
  done: styles.stateDone,
  failed: styles.stateFailed,
  warning: styles.stateWarning,
  todo: styles.stateTodo,
  na: styles.stateNa,
}

/**
 * The sidebar's progress: a count, a bar, and one row per milestone.
 *
 * Every row carries its number in the same badge, filled in the row's colour
 * once it has an answer and outlined before, so the table reads as one list of
 * things to get through.
 */
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
            milestones.map((milestone, index) => (
              <span
                className={`${styles.milestone} ${STATE_CLASS[milestone.state] ?? ''}`}
                key={milestone.id}
              >
                <span aria-hidden className={styles.badge}>
                  {index + 1}
                </span>
                <span>
                  <span className={styles.milestoneLabel}>{milestone.label}</span>
                  {milestone.note ? (
                    <span className={styles.milestoneNote}>{milestone.note}</span>
                  ) : null}
                </span>
              </span>
            )),
          ),
          tableColumn(
            'status',
            'Status',
            milestones.map((milestone) => (
              <span
                className={`${styles.status} ${STATE_CLASS[milestone.state] ?? ''}`}
                key={milestone.id}
              >
                {milestone.status}
              </span>
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
      <progress
        aria-label="Install progress"
        className={styles.progressBar}
        max={total}
        value={done}
      />
    </div>
  )
}
