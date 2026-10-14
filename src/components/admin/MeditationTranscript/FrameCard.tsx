'use client'

import { Button, MoreIcon, Popup, PopupList } from '@payloadcms/ui'
import { Check } from 'lucide-react'
import React from 'react'

import { FrameThumbnail } from '@/components/admin/FrameEditor/FrameThumbnail'
import type { Frame } from '@/payload-types'
import type { KeyframeData } from '@/types/frames'

import styles from './MeditationTranscript.module.css'
import { clock, type FrameStatus } from './rows'

/** Another frame at a time, as a card names it. */
export type OtherFrame = { name: string; time: number; frame: Frame | KeyframeData }

export type FrameCardProps = {
  status: FrameStatus
  time: number
  name: string
  /** The frame's tags, under the name. */
  details?: string
  frame: Frame | KeyframeData
  /** Why the suggestion picked this frame. */
  reason?: string
  /** A changed suggestion's: the frame it had suggested. */
  suggestedName?: string
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

const LABEL: Record<Exclude<FrameStatus, 'suggested'>, string> = {
  frame: 'Frame',
  approved: 'Suggestion approved',
  changed: 'Changed from the suggestion',
}

/**
 * Every card stacks the same bands — what it is and when, then the picture with its name — so
 * nothing shares a row with the name when the live preview leaves the form column narrow. A
 * suggestion adds what it replaces and its actions, all visible: reviewing them is the job here.
 */
export function FrameCard(props: FrameCardProps) {
  const { status, time, name, details, frame, reason, suggestedName, replaces, replacedBy } = props
  const suggested = status === 'suggested'
  const label = suggested ? 'Suggested frame' : replacedBy ? 'To be replaced' : LABEL[status]

  return (
    <article
      className={styles.card}
      data-replaced={replacedBy ? 'true' : undefined}
      data-status={status}
    >
      <header className={styles.cardHeader}>
        <span className={styles.cardLabel}>
          {(status === 'approved' || status === 'changed') && (
            <Check aria-hidden="true" size={14} strokeWidth={2.5} />
          )}
          {label}
        </span>
        <span className={styles.cardHeaderEnd}>
          <button
            className={styles.cardTime}
            onClick={props.onSeek}
            title="Play from here"
            type="button"
          >
            {clock(time)}
          </button>
          {!suggested && <FrameMenu {...props} />}
        </span>
      </header>
      <div className={styles.cardMain}>
        <span className={styles.cardImage}>{thumb(frame, 64)}</span>
        <div className={styles.cardBody}>
          <span className={styles.cardName}>{name}</span>
          {details && <span className={styles.cardMeta}>{details}</span>}
          {suggestedName ? (
            <p className={styles.cardNote}>Suggested: {suggestedName}</p>
          ) : (
            reason && <p className={styles.cardNote}>{reason}</p>
          )}
          {replacedBy && (
            <p className={styles.replacedNote}>
              The suggestion at {clock(replacedBy.time)} replaces this with {replacedBy.name}
            </p>
          )}
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
      {suggested && (
        <footer className={styles.suggestionActions}>
          <Button buttonStyle="transparent" margin={false} onClick={props.onSetAside} size="small">
            {replaces ? 'Keep current' : 'Not needed'}
          </Button>
          <span className={styles.suggestionDecide}>
            <Button buttonStyle="secondary" margin={false} onClick={props.onChange} size="small">
              Pick another
            </Button>
            <Button buttonStyle="primary" margin={false} onClick={props.onApprove} size="small">
              Approve
            </Button>
          </span>
        </footer>
      )}
    </article>
  )
}

function FrameMenu({ onChange, onRemove }: FrameCardProps) {
  const menu = [
    { label: 'Change frame', run: onChange },
    { label: 'Remove frame', run: onRemove },
  ]
  return (
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
  )
}
