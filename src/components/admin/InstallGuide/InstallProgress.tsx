'use client'

import type { Milestone, MilestoneState } from './installModel'

import { Table } from '@payloadcms/ui'
import React from 'react'

import { tableColumn } from '@/components/admin/helpers/tableColumn'

import styles from './InstallGuide.module.css'

const DETAIL_CLASS: Record<MilestoneState, string | undefined> = {
  done: styles.detailDone,
  failed: styles.detailFailed,
  warning: styles.detailWarning,
  todo: styles.detailTodo,
}

const ICON_CLASS: Record<MilestoneState, string | undefined> = {
  done: styles.iconDone,
  failed: styles.iconFailed,
  warning: styles.iconWarning,
  todo: styles.iconTodo,
}

/**
 * The sidebar's progress: a count, a bar, and one row per milestone.
 *
 * A milestone still to come shows its number rather than an empty light, so the
 * table reads as a list of things to get through rather than of things missing.
 */
export function InstallProgress({ milestones }: { milestones: Milestone[] }): React.ReactElement {
  const done = milestones.filter((milestone) => milestone.state === 'done').length
  const total = milestones.length

  return (
    <div className={styles.progress}>
      <div className={styles.progressHeader}>
        <span className={done === total ? styles.progressComplete : styles.progressCount}>
          {done === total ? 'All done' : `${done} of ${total} done`}
        </span>
        <progress
          aria-label="Install progress"
          className={styles.progressBar}
          max={total}
          value={done}
        />
      </div>
      <Table
        appearance="condensed"
        columns={[
          tableColumn(
            'milestone',
            'Milestone',
            milestones.map((milestone, index) => (
              <span className={styles.milestone} key={milestone.id}>
                <MilestoneIcon number={index + 1} state={milestone.state} />
                {milestone.label}
              </span>
            )),
          ),
          tableColumn(
            'status',
            'Status',
            milestones.map((milestone) => (
              <span className={DETAIL_CLASS[milestone.state]} key={milestone.id}>
                {milestone.detail}
              </span>
            )),
          ),
        ]}
        data={milestones.map((milestone) => ({ id: milestone.id }))}
      />
    </div>
  )
}

const ICON_LABEL: Record<MilestoneState, string> = {
  done: 'Done',
  failed: 'Needs fixing',
  warning: 'Needs attention',
  todo: 'Still to come',
}

/** A filled badge once a milestone has an answer, a numbered ring before. */
function MilestoneIcon({ state, number }: { state: MilestoneState; number: number }) {
  return (
    <svg
      aria-label={ICON_LABEL[state]}
      className={`${styles.milestoneIcon} ${ICON_CLASS[state] ?? ''}`}
      height="20"
      role="img"
      viewBox="0 0 20 20"
      width="20"
    >
      {state === 'todo' ? (
        <>
          <circle cx="10" cy="10" fill="none" r="8.5" stroke="currentColor" strokeWidth="1.5" />
          <text
            dominantBaseline="central"
            fill="currentColor"
            fontSize="10"
            fontWeight="600"
            textAnchor="middle"
            x="10"
            y="10.5"
          >
            {number}
          </text>
        </>
      ) : (
        <>
          <circle cx="10" cy="10" fill="currentColor" r="10" />
          <g
            fill="none"
            stroke="var(--theme-elevation-0)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          >
            {state === 'done' ? <path d="M5.5 10.5l3 3 6-6.5" /> : null}
            {state === 'failed' ? <path d="M6.5 6.5l7 7M13.5 6.5l-7 7" /> : null}
            {state === 'warning' ? <path d="M10 5.5v5.5M10 14.5v0.01" /> : null}
          </g>
        </>
      )}
    </svg>
  )
}
