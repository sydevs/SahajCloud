'use client'

import type { FieldDescriptionClientProps, RichTextFieldClient } from 'payload'

import { useLocale } from '@payloadcms/ui'
import React from 'react'

import { useEnglishTranslation } from './useEnglishTranslation'

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'calc(var(--base) * 0.25)',
  padding: 'calc(var(--base) * 0.4) 0',
  color: 'var(--theme-elevation-600)',
  fontSize: 'calc(var(--base-body-size) * 0.9px)',
}

const englishBoxStyle: React.CSSProperties = {
  padding: 'calc(var(--base) * 0.4)',
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-100)',
  borderRadius: 'var(--style-radius-s)',
  color: 'var(--theme-elevation-700)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

const labelStyle: React.CSSProperties = {
  fontSize: 'calc(var(--base-body-size) * 0.8px)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--theme-elevation-500)',
}

function extractPlainText(node: unknown): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractPlainText).join('')
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (Array.isArray(obj.children)) return extractPlainText(obj.children)
    if (obj.root) return extractPlainText(obj.root)
  }
  return ''
}

export const RichTextReference: React.FC<FieldDescriptionClientProps> = ({ field }) => {
  const richField = field as RichTextFieldClient
  const { name, admin: { description, custom } = {} } = richField
  const globalSlug = (custom?.globalSlug as string | undefined) ?? null

  const locale = useLocale()
  const isEnglish = locale?.code === 'en'

  const { data, isLoading, isError } = useEnglishTranslation(isEnglish ? null : globalSlug)

  const englishRaw = data && typeof data === 'object' ? (data as Record<string, unknown>)[name] : null
  const englishText = extractPlainText(englishRaw)

  return (
    <div style={containerStyle}>
      {typeof description === 'string' && description && <div>{description}</div>}
      {!isEnglish && (
        <>
          <div style={labelStyle}>English reference</div>
          {isLoading ? (
            <div style={englishBoxStyle}>Loading...</div>
          ) : isError ? (
            <div style={englishBoxStyle}>Reference unavailable</div>
          ) : (
            <div style={englishBoxStyle}>{englishText || <em>(empty)</em>}</div>
          )}
        </>
      )}
    </div>
  )
}

export default RichTextReference
