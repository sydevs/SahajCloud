'use client'

import React from 'react'

export interface DetectedHeading {
  slug: string
  text: string
  level: number
}

interface TableOfContentsProps {
  detected: DetectedHeading[]
  enabled: DetectedHeading[]
  onToggle: (slug: string) => void
  readOnly?: boolean
  blockedSlugs?: ReadonlySet<string>
}

export const TableOfContents: React.FC<TableOfContentsProps> = ({
  detected,
  enabled,
  onToggle,
  readOnly = false,
  blockedSlugs,
}) => {
  const enabledSlugs = new Set(enabled.map((h) => h.slug))

  if (detected.length === 0) {
    return (
      <div
        style={{
          padding: 'calc(var(--base) * 0.5)',
          color: 'var(--theme-elevation-400)',
          fontSize: 'calc(var(--base-body-size) * 1px)',
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
      {detected.map((heading) => {
        const isEnabled = enabledSlugs.has(heading.slug)
        const isBlocked = !isEnabled && !!blockedSlugs?.has(heading.slug)
        const indentLevel = heading.level - 1
        const buttonCursor = readOnly ? 'default' : isBlocked ? 'not-allowed' : 'pointer'

        return (
          <div
            key={heading.slug}
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
              onClick={() => onToggle(heading.slug)}
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

            <span
              onClick={readOnly || isBlocked ? undefined : () => onToggle(heading.slug)}
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 'calc(var(--base-body-size) * 1px)',
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
                fontSize: 'calc(var(--base-body-size) * 0.85px)',
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
