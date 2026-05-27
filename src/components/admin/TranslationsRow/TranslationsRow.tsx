'use client'

import React from 'react'

export interface TranslationsRowProps {
  title: string
  description?: string
  englishValue: string
  isEnglish: boolean
  isLoadingEnglish?: boolean
  isErrorEnglish?: boolean
  children: React.ReactNode
}

const baseRowStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'calc(var(--base) * 0.75)',
  alignItems: 'start',
  padding: 'calc(var(--base) * 0.5) 0',
  borderBottom: '1px solid var(--theme-elevation-100)',
}

const headerCellStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'calc(var(--base) * 0.15)',
  minWidth: 0,
}

const titleStyle: React.CSSProperties = {
  fontSize: 'calc(var(--base-body-size) * 1px)',
  fontWeight: 600,
  color: 'var(--theme-elevation-800)',
}

const descriptionStyle: React.CSSProperties = {
  fontSize: 'calc(var(--base-body-size) * 0.85px)',
  color: 'var(--theme-elevation-500)',
  lineHeight: 1.4,
}

const englishValueStyle: React.CSSProperties = {
  fontSize: 'calc(var(--base-body-size) * 1px)',
  color: 'var(--theme-elevation-700)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  minWidth: 0,
}

const placeholderStyle: React.CSSProperties = {
  ...englishValueStyle,
  color: 'var(--theme-elevation-400)',
  fontStyle: 'italic',
}

export const TranslationsRow: React.FC<TranslationsRowProps> = ({
  title,
  description,
  englishValue,
  isEnglish,
  isLoadingEnglish,
  isErrorEnglish,
  children,
}) => {
  const rowStyle: React.CSSProperties = {
    ...baseRowStyle,
    gridTemplateColumns: isEnglish ? '280px 1fr' : '280px 280px 1fr',
  }

  let englishCell: React.ReactNode = null
  if (!isEnglish) {
    if (isLoadingEnglish) {
      englishCell = <div style={placeholderStyle}>Loading...</div>
    } else if (isErrorEnglish) {
      englishCell = <div style={placeholderStyle}>Reference unavailable</div>
    } else {
      englishCell = englishValue ? (
        <div style={englishValueStyle}>{englishValue}</div>
      ) : (
        <div style={englishValueStyle} />
      )
    }
  }

  return (
    <div style={rowStyle}>
      <div style={headerCellStyle}>
        <div style={titleStyle}>{title}</div>
        {description && <div style={descriptionStyle}>{description}</div>}
      </div>
      {englishCell}
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  )
}
