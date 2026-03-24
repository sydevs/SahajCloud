'use client'

import type { DetectedHeading } from './TableOfContents'
import type { JSONFieldClientComponent } from 'payload'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $isHeadingNode } from '@lexical/rich-text'
import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import { $getRoot } from 'lexical'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import slugify from 'slugify'

import { TableOfContents } from './TableOfContents'

export const TableOfContentsField: JSONFieldClientComponent = ({ field, readOnly }) => {
  const { name, label, admin: { description } = {} } = field

  const { value: storedValue, setValue, showError } = useField<DetectedHeading[] | null>()

  const [detectedHeadings, setDetectedHeadings] = useState<DetectedHeading[]>([])

  // Keep a ref mirror of storedValue to avoid stale closures in registerUpdateListener
  const storedValueRef = useRef<DetectedHeading[] | null>(storedValue ?? null)
  const prevDetectedKeyRef = useRef<string>('')

  useEffect(() => {
    storedValueRef.current = storedValue ?? null
  }, [storedValue])

  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const unregister = editor.registerUpdateListener(({ editorState }) => {
      const detected: DetectedHeading[] = []

      editorState.read(() => {
        $getRoot()
          .getChildren()
          .forEach((node) => {
            if ($isHeadingNode(node)) {
              const text = node.getTextContent().trim()
              if (text) {
                detected.push({
                  slug: slugify(text, { lower: true, strict: true }),
                  text,
                  level: parseInt(node.getTag().slice(1), 10),
                })
              }
            }
          })
      })

      // Skip update if the heading list hasn't changed (cursor/format changes)
      const key = detected.map((h) => h.slug).join('|')
      if (key === prevDetectedKeyRef.current) return
      prevDetectedKeyRef.current = key

      setDetectedHeadings(detected)

      const current = storedValueRef.current
      if (current === null && detected.length > 0) {
        // First real initialization: enable all headings
        setValue(detected)
      } else if (current !== null) {
        // Rebuild enabled set in document order so that if a heading's slug changes
        // (disabling it), its children are dropped too rather than left orphaned.
        const currentSlugs = new Set(current.map((h) => h.slug))
        const newEnabled: DetectedHeading[] = []
        const newEnabledSet = new Set<string>()

        for (let i = 0; i < detected.length; i++) {
          const d = detected[i]
          if (!currentSlugs.has(d.slug)) continue

          let parentOk = true
          for (let j = i - 1; j >= 0; j--) {
            if (detected[j].level < d.level) {
              parentOk = newEnabledSet.has(detected[j].slug)
              break
            }
          }

          if (parentOk) {
            newEnabled.push(d)
            newEnabledSet.add(d.slug)
          }
        }

        setValue(newEnabled)
      }
    })

    return unregister
  }, [editor, setValue])

  const enabledHeadings: DetectedHeading[] = useMemo(() => storedValue ?? [], [storedValue])

  // Headings that cannot be enabled because their nearest parent heading is disabled
  const blockedSlugs = useMemo(() => {
    const enabledSet = new Set(enabledHeadings.map((h) => h.slug))
    const blocked = new Set<string>()
    for (let i = 0; i < detectedHeadings.length; i++) {
      const h = detectedHeadings[i]
      if (!enabledSet.has(h.slug)) {
        for (let j = i - 1; j >= 0; j--) {
          if (detectedHeadings[j].level < h.level) {
            if (!enabledSet.has(detectedHeadings[j].slug)) {
              blocked.add(h.slug)
            }
            break
          }
        }
      }
    }
    return blocked
  }, [detectedHeadings, enabledHeadings])

  const handleToggle = useCallback(
    (slug: string) => {
      const index = detectedHeadings.findIndex((h) => h.slug === slug)
      if (index === -1) return

      const parentLevel = detectedHeadings[index].level
      const affected = new Set([slug])
      for (let i = index + 1; i < detectedHeadings.length; i++) {
        if (detectedHeadings[i].level <= parentLevel) break
        affected.add(detectedHeadings[i].slug)
      }

      const isEnabled = enabledHeadings.some((h) => h.slug === slug)

      if (isEnabled) {
        setValue(enabledHeadings.filter((h) => !affected.has(h.slug)))
      } else {
        if (blockedSlugs.has(slug)) return
        const enabledSet = new Set(enabledHeadings.map((h) => h.slug))
        const toAdd = detectedHeadings.filter(
          (h) => affected.has(h.slug) && !enabledSet.has(h.slug),
        )
        const combined = [...enabledHeadings, ...toAdd]
        combined.sort(
          (a, b) =>
            detectedHeadings.findIndex((h) => h.slug === a.slug) -
            detectedHeadings.findIndex((h) => h.slug === b.slug),
        )
        setValue(combined)
      }
    },
    [blockedSlugs, detectedHeadings, enabledHeadings, setValue],
  )

  return (
    <div className="field-type json" id={`field-${name}`}>
      <FieldLabel label={label || 'Headings'} path={name} />
      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />
        <TableOfContents
          detected={detectedHeadings}
          enabled={enabledHeadings}
          onToggle={handleToggle}
          readOnly={readOnly}
          blockedSlugs={blockedSlugs}
        />
      </div>
      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default TableOfContentsField
