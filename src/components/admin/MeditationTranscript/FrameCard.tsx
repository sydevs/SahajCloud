'use client'

import { Button, MoreIcon, Pill, Popup, PopupList, SwapIcon } from '@payloadcms/ui'
import React from 'react'

import { FrameThumbnail } from '@/components/admin/FrameEditor/FrameThumbnail'
import type { Frame } from '@/payload-types'
import type { KeyframeData } from '@/types/frames'

import styles from './MeditationTranscript.module.css'
import { clock, type FrameStatus } from './rows'

const PILL = {
  approved: { label: 'Approved', style: 'success' },
  changed: { label: 'Changed', style: 'success' },
  suggested: { label: 'Suggested', style: 'warning' },
} as const

export type FrameCardProps = {
  status: FrameStatus
  time: number
  title: string
  frame: Frame | KeyframeData
  /** The suggestion's one-sentence reason. */
  reason?: string
  /** The editor frame a suggestion would replace. */
  replaces?: { title: string; time: number }
  onSeek: () => void
  onApprove: () => void
  onChange: () => void
  onSetAside: () => void
  onRemove: () => void
}

/**
 * One picture change in the transcript, laid out like a Payload array row: the picture, its time
 * and title, a status pill, the one main action, and the rest in the row's "…" menu.
 */
export function FrameCard({
  status,
  time,
  title,
  frame,
  reason,
  replaces,
  onSeek,
  onApprove,
  onChange,
  onSetAside,
  onRemove,
}: FrameCardProps) {
  const suggested = status === 'suggested'
  const pill = status === 'frame' ? null : PILL[status]
  const menu = suggested
    ? [
        { label: 'Pick another frame', run: onChange },
        { label: replaces ? 'Keep the current frame' : 'Not needed', run: onSetAside },
      ]
    : [
        { label: 'Change frame', run: onChange },
        { label: 'Remove frame', run: onRemove },
      ]

  return (
    <article className={`${styles.card} ${styles[status]}`} data-status={status}>
      <span className={styles.thumb}>
        <FrameThumbnail
          frame={frame}
          style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }}
        />
      </span>
      <div className={styles.cardMain}>
        <div className={styles.cardHead}>
          <button className={styles.cardTime} onClick={onSeek} title="Play from here" type="button">
            {clock(time)}
          </button>
          <span className={styles.cardTitle}>{title}</span>
          {pill && (
            <Pill pillStyle={pill.style} size="small">
              {pill.label}
            </Pill>
          )}
        </div>
        {reason && <p className={styles.reason}>{reason}</p>}
        {replaces && (
          <p className={styles.reason}>
            <SwapIcon /> Replaces {replaces.title} at {clock(replaces.time)}
          </p>
        )}
      </div>
      <div className={styles.cardActions}>
        {suggested && (
          <Button buttonStyle="primary" margin={false} onClick={onApprove} size="small">
            Approve
          </Button>
        )}
        <Popup
          button={
            <span aria-label="More actions" className={styles.more}>
              <MoreIcon />
            </span>
          }
          horizontalAlign="right"
          render={({ close }) => (
            <PopupList.ButtonGroup>
              {menu.map((item) => (
                <PopupList.Button
                  key={item.label}
                  onClick={() => {
                    close()
                    item.run()
                  }}
                >
                  {item.label}
                </PopupList.Button>
              ))}
            </PopupList.ButtonGroup>
          )}
          size="small"
        />
      </div>
    </article>
  )
}
