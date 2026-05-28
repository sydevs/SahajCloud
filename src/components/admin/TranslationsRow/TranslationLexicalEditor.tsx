'use client'

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import {
  $createLinkNode,
  $isLinkNode,
  LinkNode,
  TOGGLE_LINK_COMMAND,
} from '@payloadcms/richtext-lexical/client'
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_EDITOR,
  type EditorState,
  FORMAT_TEXT_COMMAND,
  type SerializedEditorState,
} from 'lexical'
import React, { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Minimal controlled Lexical editor used inside TranslationsRow for richText
 * keys. Mirrors the features of `basicRichTextEditor` from `@/lib/richEditor`
 * (Bold, Italic, Link) without depending on Payload's RSC-bound Lexical
 * pipeline — that pipeline needs server-prepared `editorConfig`,
 * `clientFeatures`, etc., none of which are accessible to a client-only Field
 * replacement.
 *
 * Value is the standard Lexical SerializedEditorState shape Payload already
 * stores for richText fields. Links are stored in Payload's format:
 * `{ type: 'link', fields: { linkType: 'custom', url, newTab: false }, ... }`.
 * Importing LinkNode from @payloadcms/richtext-lexical/client avoids pulling
 * in the server-only pino/worker_threads dependencies.
 */

export type TranslationLexicalValue = SerializedEditorState | null | undefined

export interface TranslationLexicalEditorProps {
  value: TranslationLexicalValue
  onChange: (next: SerializedEditorState) => void
  readOnly?: boolean
  ariaLabel?: string
}

const emptyEditorState =
  '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}'

const onError = (e: Error) => {
  // eslint-disable-next-line no-console
  console.error('[TranslationLexicalEditor]', e)
}

export const TranslationLexicalEditor: React.FC<TranslationLexicalEditorProps> = ({
  value,
  onChange,
  readOnly,
  ariaLabel,
}) => {
  const initialEditorState = value ? JSON.stringify(value) : emptyEditorState

  return (
    <LexicalComposer
      initialConfig={{
        namespace: 'TranslationLexicalEditor',
        nodes: [LinkNode],
        onError,
        editorState: initialEditorState,
        editable: !readOnly,
      }}
    >
      <Toolbar readOnly={readOnly} />
      <div className="translations-row__lexical-shell">
        <RichTextPlugin
          contentEditable={
            <ContentEditable className="translations-row__lexical-content" aria-label={ariaLabel} />
          }
          placeholder={
            <div className="translations-row__lexical-placeholder">Enter translation...</div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      <HistoryPlugin />
      <PayloadLinkPlugin />
      <OnChangePlugin
        ignoreSelectionChange
        onChange={(editorState: EditorState) => {
          onChange(editorState.toJSON())
        }}
      />
      <ExternalValueSync value={value} />
      <ReadOnlySync readOnly={!!readOnly} />
    </LexicalComposer>
  )
}

/**
 * When the field's value is updated from outside (e.g. locale switch) push
 * the new state into the editor. Skips updates that match the editor's
 * current serialized state to avoid feedback loops with OnChangePlugin.
 */
const ExternalValueSync: React.FC<{ value: TranslationLexicalValue }> = ({ value }) => {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    if (!value) return
    const incoming = JSON.stringify(value)
    const current = JSON.stringify(editor.getEditorState().toJSON())
    if (incoming === current) return
    try {
      const parsed = editor.parseEditorState(incoming)
      editor.setEditorState(parsed)
    } catch (e) {
      onError(e as Error)
    }
  }, [editor, value])

  return null
}

const ReadOnlySync: React.FC<{ readOnly: boolean }> = ({ readOnly }) => {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    editor.setEditable(!readOnly)
  }, [editor, readOnly])
  return null
}

/**
 * Handles Payload's TOGGLE_LINK_COMMAND so links are stored in Payload's
 * format: `fields: { linkType: 'custom', url, newTab }`.
 * $toggleLink is not exported from the client package so we implement
 * the minimal subset needed for this editor (single-selection links only).
 */
const PayloadLinkPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    return editor.registerCommand(
      TOGGLE_LINK_COMMAND,
      (payload) => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return false

        if (payload === null) {
          selection.getNodes().forEach((node) => {
            const parent = node.getParent()
            if ($isLinkNode(parent)) {
              parent.getChildren().forEach((child) => parent.insertBefore(child))
              parent.remove()
            } else if ($isLinkNode(node)) {
              node.getChildren().forEach((child) => node.insertBefore(child))
              node.remove()
            }
          })
          return true
        }

        const fields = { linkType: 'custom' as const, url: payload.fields?.url ?? '', newTab: false }
        const nodes = selection.getNodes()
        const firstNode = nodes[0]
        const parent = firstNode?.getParent()

        if ($isLinkNode(firstNode)) {
          firstNode.setFields(fields)
        } else if ($isLinkNode(parent)) {
          parent.setFields(fields)
        } else {
          const textContent = selection.getTextContent()
          const linkNode = $createLinkNode({ fields })
          linkNode.append($createTextNode(textContent))
          selection.insertNodes([linkNode])
        }
        return true
      },
      COMMAND_PRIORITY_EDITOR,
    )
  }, [editor])
  return null
}

const Toolbar: React.FC<{ readOnly?: boolean }> = ({ readOnly }) => {
  const [editor] = useLexicalComposerContext()
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isLink, setIsLink] = useState(false)
  const [linkInputVisible, setLinkInputVisible] = useState(false)
  const [pendingUrl, setPendingUrl] = useState('')
  const urlInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) {
          setIsBold(false)
          setIsItalic(false)
          setIsLink(false)
          return
        }
        setIsBold(selection.hasFormat('bold'))
        setIsItalic(selection.hasFormat('italic'))
        const node = selection.getNodes()[0]
        const parent = node?.getParent()
        setIsLink($isLinkNode(node) || $isLinkNode(parent))
      })
    })
  }, [editor])

  const applyLink = useCallback(() => {
    const url = pendingUrl.trim()
    if (url) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, { fields: { linkType: 'custom', url, newTab: false }, text: null })
    }
    setLinkInputVisible(false)
    setPendingUrl('')
  }, [editor, pendingUrl])

  const cancelLink = useCallback(() => {
    setLinkInputVisible(false)
    setPendingUrl('')
  }, [])

  return (
    <>
      <div className="translations-row__lexical-toolbar">
        <button
          type="button"
          disabled={readOnly}
          className={`translations-row__lexical-btn${isBold ? ' translations-row__lexical-btn--active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')
          }}
          aria-label="Bold"
          aria-pressed={isBold}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          disabled={readOnly}
          className={`translations-row__lexical-btn${isItalic ? ' translations-row__lexical-btn--active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')
          }}
          aria-label="Italic"
          aria-pressed={isItalic}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          disabled={readOnly}
          className={`translations-row__lexical-btn${isLink ? ' translations-row__lexical-btn--active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            if (isLink) {
              editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
            } else {
              setLinkInputVisible(true)
              setTimeout(() => urlInputRef.current?.focus(), 0)
            }
          }}
          aria-label="Insert link"
          aria-pressed={isLink}
        >
          <span style={{ textDecoration: 'underline' }}>Link</span>
        </button>
      </div>
      {linkInputVisible && !readOnly && (
        <div className="translations-row__lexical-link-input">
          <input
            ref={urlInputRef}
            type="url"
            value={pendingUrl}
            onChange={(e) => setPendingUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyLink()
              } else if (e.key === 'Escape') {
                cancelLink()
              }
            }}
            placeholder="https://..."
            aria-label="Link URL"
          />
          <button type="button" onMouseDown={(e) => { e.preventDefault(); applyLink() }}>
            Apply
          </button>
          <button type="button" onMouseDown={(e) => { e.preventDefault(); cancelLink() }}>
            Cancel
          </button>
        </div>
      )}
    </>
  )
}
