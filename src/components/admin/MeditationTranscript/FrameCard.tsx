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
} as const

/** Another frame at a time, as a card names it. */
export type OtherFrame = { name: string; time: number; frame: Frame | KeyframeData }

export type FrameCardProps = {
  status: FrameStatus
  time: number
  name: string
  /** The frame's tags, after the time. */
  details?: string
  frame: Frame | KeyframeData
  /** Why the suggestion picked this frame. */
  reason?: string
  /** A suggestion's: the editor frame that approving it removes. */
  replaces?: OtherFrame
  /** A frame's: the waiting suggestion that would replace it. */
  replacedBy?: OtherFrame
  onSeek: () => void
  onApprove: () => void
  onChange: () => void
  onSetAside: () => void
  onRemove: () => void
}

const thumb = (frame: Frame | KeyframeData, size: number) => (
  <FrameThumbnail frame={frame} style={{ width: size, height: size, objectFit: 'cover' }} />
)

export function FrameCard(props: FrameCardProps) {
  return props.status === 'suggested' ? <SuggestionCard {...props} /> : <PlacedCard {...props} />
}

/**
 * A suggestion stacks in bands — what it is and when, the picture with its reason, what it
 * replaces, then the actions — so nothing shares a row with the name when the live preview
 * leaves the form column narrow. Every action stays visible: reviewing them is the job here.
 */
function SuggestionCard({
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
}: FrameCardProps) {
  return (
    <article className={styles.card} data-status="suggested">
      <header className={styles.suggestionHeader}>
        <span>Suggested frame</span>
        <button className={styles.cardTime} onClick={onSeek} title="Play from here" type="button">
          {clock(time)}
        </button>
      </header>
      <div className={styles.suggestionMain}>
        <span className={styles.cardImage}>{thumb(frame, 64)}</span>
        <div className={styles.cardBody}>
          <span className={styles.suggestionName}>{name}</span>
          {details && <span className={styles.cardMeta}>{details}</span>}
          {reason && <p className={styles.suggestionReason}>{reason}</p>}
        </div>
      </div>
      {replaces && (
        <div className={styles.suggestionReplaces}>
          <span className={styles.replacesLabel}>Replaces</span>
          <span className={styles.replacesImage}>{thumb(replaces.frame, 28)}</span>
          <span className={styles.replacesName}>
            {replaces.name} at {clock(replaces.time)}
          </span>
        </div>
      )}
      <footer className={styles.suggestionActions}>
        <Button buttonStyle="transparent" margin={false} onClick={onSetAside} size="small">
          {replaces ? 'Keep current' : 'Not needed'}
        </Button>
        <span className={styles.suggestionDecide}>
          <Button buttonStyle="secondary" margin={false} onClick={onChange} size="small">
            Pick another
          </Button>
          <Button buttonStyle="primary" margin={false} onClick={onApprove} size="small">
            Approve
          </Button>
        </span>
      </footer>
    </article>
  )
}

function PlacedCard({
  status,
  time,
  name,
  details,
  frame,
  reason,
  replacedBy,
  onSeek,
  onChange,
  onRemove,
}: FrameCardProps) {
  const pill = status === 'approved' || status === 'changed' ? PILL[status] : null
  const menu = [
    { label: 'Change frame', run: onChange },
    { label: 'Remove frame', run: onRemove },
  ]
  return (
    <article
      className={styles.card}
      data-replaced={replacedBy ? 'true' : undefined}
      data-status={status}
    >
      <span className={styles.cardImage}>{thumb(frame, 56)}</span>
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
        {replacedBy && (
          <p className={styles.replacedNote}>
            The suggestion at {clock(replacedBy.time)} replaces this with {replacedBy.name}
          </p>
        )}
      </div>
      <div className={styles.cardActions}>
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
