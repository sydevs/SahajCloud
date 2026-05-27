'use client'

import React, { useEffect, useRef } from 'react'

export interface AutoGrowTextareaProps {
  value: string
  onChange: (next: string) => void
  readOnly?: boolean
  placeholder?: string
  ariaLabel?: string
}

/**
 * Lightweight wrapper that mimics Payload's `TextareaInput` look (styling
 * inherited from `.translations-row__input-cell textarea` in styles.css) but
 * resizes the textarea height to fit content as the user types. Payload's
 * built-in TextareaInput has no autosize, only a fixed `rows` prop.
 */
export const AutoGrowTextarea: React.FC<AutoGrowTextareaProps> = ({
  value,
  onChange,
  readOnly,
  placeholder,
  ariaLabel,
}) => {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={readOnly}
      rows={1}
      placeholder={placeholder}
      aria-label={ariaLabel}
    />
  )
}
