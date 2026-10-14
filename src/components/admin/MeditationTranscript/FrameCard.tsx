'use client'

import { Button, MoreIcon, Pill, Popup, PopupList } from '@payloadcms/ui'
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
  /** What editors call the frame: its label, or its subtle-system node. */
  name: string
  /** Its tags, shown small beside the time. */
  details?: string
  frame: Frame | KeyframeData
  /** The suggestion's one-sentence reason. */
  reason?: string
  /** The editor frame a suggestion would replace. */
  replaces?: { name: string; time: number }
  onSeek: () => void
  onApprove: () => void
  onChange: () => void
  onSetAside: () => void
  onRemove: () => void
}

/**
 * A picture change, set into the transcript where it starts: the picture, its name, when and why,
 * a status pill, the one main action, and the rest in a Payload row menu.
 */
export function FrameCard({
  status,
  time,
  name,
  details,
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
    <article className={styles.card} data-status={status}>
      <span className={styles.cardImage}>
        <FrameThumbnail frame={frame} style={{ width: 56, height: 56, objectFit: 'cover' }} />
      </span>
      <div className={styles.cardBody}>
        <div className={styles.cardTitle}>
          <span className={styles.cardName}>{name}</span>
          {pill && (
            <Pill pillStyle={pill.style} size="small">
              {pill.label}
            </Pill>
          )}
        </div>
        <div className={styles.cardMeta}>
          <button className={styles.cardTime} onClick={onSeek} title="Play from here" type="button">
            {clock(time)}
          </button>
          {details && <span> · {details}</span>}
        </div>
        {reason && <p className={styles.cardNote}>{reason}</p>}
        {replaces && (
          <p className={styles.cardNote}>
            Replaces {replaces.name} at {clock(replaces.time)}
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
            <span aria-label="More actions" className={styles.cardMore}>
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
