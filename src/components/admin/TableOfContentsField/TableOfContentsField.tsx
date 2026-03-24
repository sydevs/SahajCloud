'use client'

import type { DetectedHeading } from './TableOfContents'
import type { JSONFieldClientComponent } from 'payload'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $isHeadingNode } from '@lexical/rich-text'
import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import { $getRoot, type EditorState } from 'lexical'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import slugify from 'slugify'

import { TableOfContents } from './TableOfContents'

/** Returns the index of the nearest preceding heading with a lower level, or -1 if none. */
function findParentIndex(headings: DetectedHeading[], i: number): number {
  for (let j = i - 1; j >= 0; j--) {
    if (headings[j].level < headings[i].level) return j
  }
  return -1
}

export const TableOfContentsField: JSONFieldClientComponent = ({ field, readOnly }) => {
  const { name, label, admin: { description } = {} } = field

  const { value: storedValue, setValue, showError } = useField<DetectedHeading[] | null>()

  const [detectedHeadings, setDetectedHeadings] = useState<DetectedHeading[]>([])

  // Keep a ref mirror of storedValue to avoid stale closures in registerUpdateListener.
  // Updated synchronously during render (not via useEffect) so it is never stale when
  // Lexical fires an update listener between a setValue call and the next effect flush.
  const storedValueRef = useRef<DetectedHeading[] | null>(null)
  storedValueRef.current = storedValue ?? null
  const prevDetectedKeyRef = useRef<string>('')

  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    const scanHeadings = (editorState: EditorState): DetectedHeading[] => {
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
      return detected
    }

    const applyUpdate = (detected: DetectedHeading[]) => {
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

          const pi = findParentIndex(detected, i)
          const parentOk = pi === -1 || newEnabledSet.has(detected[pi].slug)

          if (parentOk) {
            newEnabled.push(d)
            newEnabledSet.add(d.slug)
          }
        }

        setValue(newEnabled)
      }
    }

    // Populate heading list immediately on mount — registerUpdateListener only fires
    // on changes, not on the current state, so without this the field shows
    // "No headings found" until the editor receives its first update event.
    applyUpdate(scanHeadings(editor.getEditorState()))

    const unregister = editor.registerUpdateListener(({ editorState }) => {
      applyUpdate(scanHeadings(editorState))
    })

    return unregister
  }, [editor, setValue])

  const enabledHeadings: DetectedHeading[] = useMemo(() => storedValue ?? [], [storedValue])

  // Headings that cannot be enabled because their nearest parent heading is disabled
  const blockedSlugs = useMemo(() => {
    const enabledSet = new Set(enabledHeadings.map((h) => h.slug))
    const blocked = new Set<string>()
    for (let i = 0; i < detectedHeadings.length; i++) {
      if (!enabledSet.has(detectedHeadings[i].slug)) {
        const pi = findParentIndex(detectedHeadings, i)
        if (pi !== -1 && !enabledSet.has(detectedHeadings[pi].slug)) {
          blocked.add(detectedHeadings[i].slug)
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
        affected.forEach((s) => enabledSet.add(s))
        setValue(detectedHeadings.filter((h) => enabledSet.has(h.slug)))
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
