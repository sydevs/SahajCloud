'use client'

import React, { useCallback, useEffect, useRef } from 'react'

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
  const lastWidth = useRef(0)

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    // Measure by temporarily writing the text, resetting height, reading
    // scrollHeight, then restoring. When the field is empty we size to the
    // placeholder so a two-line "Enter translation — …" hint shows in full.
    const measure = (text: string) => {
      const prev = el.value
      el.value = text
      el.style.height = 'auto'
      // scrollHeight is content+padding; add the vertical border so a border-box
      // textarea's content area isn't a couple px short (clipping a line).
      const borderY = el.offsetHeight - el.clientHeight
      const h = el.scrollHeight + borderY
      el.value = prev
      return h
    }
    el.style.height = `${value ? measure(value) : measure(placeholder ?? '')}px`
  }, [value, placeholder])

  useEffect(() => {
    resize()
  }, [resize])

  // Re-measure when the field's width changes (e.g. the live-preview pane opens
  // and narrows the form, so a one-line hint now wraps to two). Guarded on width
  // so setting the height doesn't loop.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (Math.abs(w - lastWidth.current) > 1) {
        lastWidth.current = w
        resize()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [resize])

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
