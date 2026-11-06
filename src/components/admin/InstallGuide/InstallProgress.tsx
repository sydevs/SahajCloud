'use client'

import type { Milestone, MilestoneState } from './installModel'

import { Table } from '@payloadcms/ui'
import React from 'react'

import type { NumberBadgeFill } from '@/components/admin/helpers/NumberBadge'
import { NumberBadge } from '@/components/admin/helpers/NumberBadge'
import { Progress } from '@/components/admin/helpers/Progress'
import { tableColumn } from '@/components/admin/helpers/tableColumn'
import type { Tone } from '@/components/admin/helpers/tones'

import styles from './InstallGuide.module.css'
import { installProgress } from './installModel'

/**
 * One look per state, shared by the row's badge and its status word: filled in
 * the state's colour once it has an answer, outlined before, dashed when the
 * site can never reach it.
 */
const STATE_LOOK: Record<MilestoneState, { tone: Tone; fill: NumberBadgeFill; status: string }> = {
  done: { tone: 'success', fill: 'solid', status: styles.statusDone },
  failed: { tone: 'danger', fill: 'solid', status: styles.statusFailed },
  todo: { tone: 'neutral', fill: 'outline', status: styles.statusTodo },
  na: { tone: 'neutral', fill: 'dashed', status: styles.statusNa },
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
            milestones.map((milestone, index) => (
              <span className={styles.milestone} key={milestone.id}>
                <NumberBadge
                  fill={STATE_LOOK[milestone.state].fill}
                  tone={STATE_LOOK[milestone.state].tone}
                  value={index + 1}
                />
                <span>
                  <span
                    className={
                      milestone.state === 'na' ? styles.milestoneNa : styles.milestoneLabel
                    }
                  >
                    {milestone.label}
                  </span>
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
              <span className={STATE_LOOK[milestone.state].status} key={milestone.id}>
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
      <Progress label="Install progress" max={total} value={done} />
    </div>
  )
}
