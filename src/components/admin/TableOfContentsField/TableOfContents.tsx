'use client'

import React from 'react'

import type { TableOfContentsHeadings } from '@/payload-types'

interface TableOfContentsProps {
  detected: TableOfContentsHeadings
  /** Positions in `detected`, which is what identifies a heading — two may slugify alike. */
  enabled: ReadonlySet<number>
  onToggle: (position: number) => void
  readOnly?: boolean
  blocked: ReadonlySet<number>
}

export const TableOfContents: React.FC<TableOfContentsProps> = ({
  detected,
  enabled,
  onToggle,
  readOnly = false,
  blocked,
}) => {
  if (detected.length === 0) {
    return (
      <div
        style={{
          padding: 'calc(var(--base) * 0.5)',
          color: 'var(--theme-elevation-400)',
          fontSize: 'var(--admin-body-size)',
          fontStyle: 'italic',
        }}
      >
        No headings found in the document
      </div>
    )
  }

  return (
    <div
      role="list"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'calc(var(--base) * 0.25)',
        padding: 'calc(var(--base) * 0.5) 0',
      }}
    >
      {detected.map((heading, position) => {
        const isEnabled = enabled.has(position)
        const isBlocked = blocked.has(position)
        const indentLevel = heading.level - 1
        const buttonCursor = readOnly ? 'default' : isBlocked ? 'not-allowed' : 'pointer'

        return (
          <div
            key={position}
            role="listitem"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'calc(var(--base) * 0.4)',
              paddingLeft: `calc(${indentLevel} * calc(var(--base) * 0.75))`,
              opacity: isEnabled ? 1 : 0.4,
              transition: 'opacity 0.15s ease',
            }}
          >
            <button
              type="button"
              disabled={readOnly || isBlocked}
              onClick={() => onToggle(position)}
              aria-label={`${isEnabled ? 'Disable' : 'Enable'} heading: ${heading.text}`}
              aria-pressed={isEnabled}
              style={{
                flexShrink: 0,
                width: 'calc(var(--base) * 0.9)',
                height: 'calc(var(--base) * 0.9)',
                border: isEnabled
                  ? '2px solid var(--theme-elevation-500)'
                  : '2px solid var(--theme-elevation-300)',
                borderRadius: '3px',
                background: isEnabled ? 'var(--theme-elevation-500)' : 'transparent',
                cursor: buttonCursor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                transition: 'background 0.15s ease, border-color 0.15s ease',
              }}
            >
              {isEnabled && (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="var(--theme-bg)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="1.5,5 4,7.5 8.5,2.5" />
                </svg>
              )}
            </button>

            {/* A mouse convenience for the toggle button beside it, which is
                the row's one tab stop — a second would repeat its action. */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
            <span
              onClick={readOnly || isBlocked ? undefined : () => onToggle(position)}
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 'var(--admin-body-size)',
                color: 'var(--theme-elevation-800)',
                textDecoration: isEnabled ? 'none' : 'line-through',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: buttonCursor,
                userSelect: 'none',
              }}
              title={heading.text}
            >
              {heading.text}
            </span>

            <span
              style={{
                flexShrink: 0,
                fontSize: 'calc(var(--admin-body-size) * 0.85)',
                color: 'var(--theme-elevation-400)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              H{heading.level}
            </span>
          </div>
        )
      })}
    </div>
  )
}
