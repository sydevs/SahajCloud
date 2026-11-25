'use client'

import type { JSONFieldClientComponent } from 'payload'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $isHeadingNode } from '@lexical/rich-text'
import { FieldDescription, FieldError, FieldLabel, useField } from '@payloadcms/ui'
import { $getRoot, type EditorState } from 'lexical'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { fieldId } from '@/components/admin/helpers/fieldId'
import { mergeFieldStyles } from '@/components/admin/helpers/mergeFieldStyles'
import { slugifyAnchor } from '@/fields/slugify'
import type { TableOfContentsHeadings } from '@/payload-types'

import {
  blockedHeadings,
  rebuildStored,
  resolveStored,
  stampOccurrences,
  toggleHeading,
} from './headings'
import { TableOfContents } from './TableOfContents'

export const TableOfContentsField: JSONFieldClientComponent = ({ field, readOnly }) => {
  const { name, label, admin: { description } = {} } = field

  const { value: storedValue, setValue, showError } = useField<TableOfContentsHeadings | null>()

  const [detectedHeadings, setDetectedHeadings] = useState<TableOfContentsHeadings>([])

  // Keep a ref mirror of storedValue to avoid stale closures in registerUpdateListener.
  // Updated synchronously during render (not via useEffect) so it is never stale when
  // Lexical fires an update listener between a setValue call and the next effect flush.
  const storedValueRef = useRef<TableOfContentsHeadings | null>(null)
  storedValueRef.current = storedValue ?? null
  const prevDetectedKeyRef = useRef<string>('')

  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    // Which nodes count is half of the cross-repo contract `stampOccurrences`
    // carries: a top-level heading node whose trimmed text is non-empty.
    const scanHeadings = (editorState: EditorState): TableOfContentsHeadings => {
      const detected: TableOfContentsHeadings = []
      editorState.read(() => {
        $getRoot()
          .getChildren()
          .forEach((node) => {
            if ($isHeadingNode(node)) {
              const text = node.getTextContent().trim()
              if (text) {
                detected.push({
                  slug: slugifyAnchor(text),
                  text,
                  level: parseInt(node.getTag().slice(1), 10),
                })
              }
            }
          })
      })
      return stampOccurrences(detected)
    }

    const applyUpdate = (detected: TableOfContentsHeadings) => {
      // Skip update if the heading list hasn't changed (cursor/format changes)
      const key = JSON.stringify(detected)
      if (key === prevDetectedKeyRef.current) return
      prevDetectedKeyRef.current = key

      setDetectedHeadings(detected)

      const current = storedValueRef.current
      if (current === null && detected.length > 0) {
        // First real initialization: enable all headings
        setValue(detected)
      } else if (current !== null) {
        setValue(rebuildStored(detected, current))
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

  // Resolved against the document rather than read off the stored occurrences, so
  // the ticks are right while a document stored before the key existed awaits its
  // rebuild.
  const enabledHeadings = useMemo(
    () => resolveStored(detectedHeadings, storedValue ?? []),
    [detectedHeadings, storedValue],
  )

  const blocked = useMemo(
    () => blockedHeadings(detectedHeadings, enabledHeadings),
    [detectedHeadings, enabledHeadings],
  )

  const handleToggle = useCallback(
    (position: number) => {
      if (blocked.has(position)) return
      setValue(toggleHeading(detectedHeadings, enabledHeadings, position))
    },
    [blocked, detectedHeadings, enabledHeadings, setValue],
  )

  return (
    <div className="field-type json" id={fieldId(name)} style={mergeFieldStyles(field.admin)}>
      <FieldLabel label={label || 'Headings'} />
      <div className="field-type__wrap">
        <FieldError path={name} showError={showError} />
        <TableOfContents
          detected={detectedHeadings}
          enabled={enabledHeadings}
          onToggle={handleToggle}
          readOnly={readOnly}
          blocked={blocked}
        />
      </div>
      <FieldDescription description={description} path={name} />
    </div>
  )
}

export default TableOfContentsField
