'use client'

import type { RichTextFieldClientComponent } from 'payload'

import { useField, useLocale } from '@payloadcms/ui'
import { toWords } from 'payload/shared'
import React, { useCallback } from 'react'

import { TranslationLexicalEditor, type TranslationLexicalValue } from './TranslationLexicalEditor'
import { TranslationsRow } from './TranslationsRow'
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
 * Field replacement for richText translation keys. Renders the exact same
 * `TranslationsRow` layout as string keys (title + description on the left,
 * English reference in the middle, input on the right) — only the input
 * differs. The input here is a minimal Lexical editor matching the features
 * of `basicRichTextEditor` (Bold, Italic, Link).
 */
export const TranslationsRichTextField: RichTextFieldClientComponent = ({ field, readOnly }) => {
  const { name, admin: { description, custom } = {} } = field
  const translationKey = (custom?.translationKey as string | undefined) ?? name
  const globalSlug = (custom?.globalSlug as string | undefined) ?? null

  const { value, setValue, showError } = useField<TranslationLexicalValue>()
  const locale = useLocale()
  const isEnglish = locale?.code === 'en'

  const { data, isLoading, isError } = useEnglishTranslation(isEnglish ? null : globalSlug)
  const englishRaw = data && typeof data === 'object' ? (data as Record<string, unknown>)[name] : null
  const englishValue = extractPlainText(englishRaw)

  const handleChange = useCallback(
    (next: NonNullable<TranslationLexicalValue>) => {
      setValue(next)
    },
    [setValue],
  )

  return (
    <div
      className={['field-type', 'richText', showError && 'error', readOnly && 'read-only']
        .filter(Boolean)
        .join(' ')}
    >
      <TranslationsRow
        title={toWords(translationKey.replace(/_/g, '-'))}
        description={typeof description === 'string' ? description : undefined}
        englishValue={englishValue}
        isEnglish={isEnglish}
        isLoadingEnglish={isLoading}
        isErrorEnglish={isError}
      >
        <TranslationLexicalEditor
          value={value}
          onChange={handleChange}
          readOnly={readOnly}
          ariaLabel={`Translation for ${translationKey}`}
        />
      </TranslationsRow>
    </div>
  )
}

export default TranslationsRichTextField
