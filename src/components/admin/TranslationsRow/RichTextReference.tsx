'use client'

import type { FieldDescriptionClientProps, RichTextFieldClient } from 'payload'

import { useLocale } from '@payloadcms/ui'
import React from 'react'

import { useEnglishTranslation } from './useEnglishTranslation'

import './styles.css'

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

/**
 * Description slot for richText translation fields. Renders the English
 * reference value (when editing a non-English locale) as a labelled block
 * positioned above the Lexical editor. Reuses the same module-level Promise
 * cache (`useEnglishTranslation`) as the string-field rows so the global is
 * fetched only once per tab open.
 */
export const RichTextReference: React.FC<FieldDescriptionClientProps> = ({ field }) => {
  const richField = field as RichTextFieldClient
  const { name, admin: { description, custom } = {} } = richField
  const globalSlug = (custom?.globalSlug as string | undefined) ?? null

  const locale = useLocale()
  const isEnglish = locale?.code === 'en'

  const { data, isLoading, isError } = useEnglishTranslation(isEnglish ? null : globalSlug)

  const englishRaw = data && typeof data === 'object' ? (data as Record<string, unknown>)[name] : null
  const englishText = extractPlainText(englishRaw)

  if (isEnglish && !description) return null

  return (
    <>
      {typeof description === 'string' && description && (
        <div className="translations-row__description">{description}</div>
      )}
      {!isEnglish && (
        <>
          <div className="translations-row__english-label">English reference</div>
          <div className="translations-row__english-block">
            {isLoading ? 'Loading...' : isError ? 'Reference unavailable' : englishText || <em>(empty)</em>}
          </div>
        </>
      )}
    </>
  )
}

export default RichTextReference
