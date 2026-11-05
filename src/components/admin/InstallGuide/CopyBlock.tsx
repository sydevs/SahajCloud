'use client'

import type { Snippet } from './steps'

import { CodeEditor, CopyToClipboard } from '@payloadcms/ui'
import React, { useState } from 'react'

import styles from './InstallGuide.module.css'

/** Past this, a whole file scrolls inside its box rather than pushing the steps off the page. */
const FILE_MAX_HEIGHT = 384

/**
 * One value a volunteer has to get into another system, with a Copy button.
 *
 * ⚠ **Read-only, never an editable field.** Nothing here is the volunteer's to
 * change: the router code has to agree with the endpoint, the key is the key,
 * and a field that accepts typing invites a correction that breaks the install
 * with no error anywhere. Code goes in Payload's `CodeEditor` with `readOnly`,
 * for its highlighting; a single value stays a `<pre>`. `CopyToClipboard` is
 * Payload's own, so it behaves like the Reveal button beside the API key rather
 * than like a second idiom.
 *
 * ⚠ **Sized from the editor's own content height.** `CodeEditor` sizes itself
 * by counting lines at 18px, but it also wraps them, so a two-line snippet with
 * a long `<script>` tag wraps to four and scrolls inside a two-line box. Its
 * `minHeight` and `recalculatedHeightAt` props are the seam for a height it
 * cannot count: Monaco reports the wrapped height, and every change of it — a
 * narrower window re-wraps — is fed back. Only a whole file is capped.
 *
 * ⚠ **That height reaches only CodeEditor's outer wrapper.** Payload's
 * `.code-editor` container inside it keeps its content height, and Monaco lays
 * out against the container, so the stylesheet makes it fill the wrapper —
 * without that rule the box grows and the editor in it does not.
 */
export function CopyBlock({ snippet }: { snippet: Snippet }): React.ReactElement {
  const [fit, setFit] = useState<{ height: number; at: number } | null>(null)
  return (
    <div className={styles.copyBlock}>
      <div className={styles.copyHeader}>
        <span className="field-label">{snippet.label}</span>
        <CopyToClipboard value={snippet.value} />
      </div>
      {snippet.kind === 'text' ? (
        <pre className={styles.copyValue}>{snippet.value}</pre>
      ) : (
        <CodeEditor
          language={snippet.kind}
          maxHeight={snippet.kind === 'javascript' ? FILE_MAX_HEIGHT : undefined}
          minHeight={fit?.height}
          onMount={(editor) => {
            // +2 for the container's border, as CodeEditor's own line count adds.
            const measure = () => setFit({ height: editor.getContentHeight() + 2, at: Date.now() })
            editor.onDidContentSizeChange(measure)
            measure()
          }}
          readOnly
          // Starts at 0, not undefined: the editor applies a new height only
          // when this grows past the value it mounted with.
          recalculatedHeightAt={fit?.at ?? 0}
          value={snippet.value}
        />
      )}
    </div>
  )
}

export default CopyBlock
