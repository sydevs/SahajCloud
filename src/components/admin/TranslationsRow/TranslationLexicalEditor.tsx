'use client'

import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import {
  $createLinkNode,
  $isLinkNode,
  LinkNode,
  TOGGLE_LINK_COMMAND,
} from '@payloadcms/richtext-lexical/lexical/link'
import {
  $getSelection,
  $isRangeSelection,
  type EditorState,
  FORMAT_TEXT_COMMAND,
  type SerializedEditorState,
} from 'lexical'
import React, { useCallback, useEffect, useState } from 'react'

/**
 * Minimal controlled Lexical editor used inside TranslationsRow for richText
 * keys. Mirrors the features of `basicRichTextEditor` from `@/lib/richEditor`
 * (Bold, Italic, Link) without depending on Payload's RSC-bound Lexical
 * pipeline — that pipeline needs server-prepared `editorConfig`,
 * `clientFeatures`, etc., none of which are accessible to a client-only Field
 * replacement.
 *
 * Value is the standard Lexical SerializedEditorState shape Payload already
 * stores for richText fields.
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
      <LinkPlugin />
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

const Toolbar: React.FC<{ readOnly?: boolean }> = ({ readOnly }) => {
  const [editor] = useLexicalComposerContext()
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isLink, setIsLink] = useState(false)

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

  const toggleLink = useCallback(() => {
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return
      if (isLink) {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
      } else {
        const url = window.prompt('Enter URL:')
        if (!url) return
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, url)
        // Wrap with link node if not already
        if (!$isLinkNode(selection.getNodes()[0]?.getParent())) {
          const linkNode = $createLinkNode(url)
          selection.insertNodes([linkNode])
        }
      }
    })
  }, [editor, isLink])

  return (
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
          toggleLink()
        }}
        aria-label="Insert link"
        aria-pressed={isLink}
      >
        🔗
      </button>
    </div>
  )
}
