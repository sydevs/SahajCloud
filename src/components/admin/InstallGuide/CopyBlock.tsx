'use client'

import type { Snippet } from './steps'

import { CodeEditor, CopyToClipboard } from '@payloadcms/ui'
import React from 'react'

import styles from './InstallGuide.module.css'

/**
 * One value a volunteer has to get into another system, with a Copy button.
 *
 * ⚠ **Read-only, never an editable field.** Nothing here is the volunteer's to
 * change: the router code has to agree with the endpoint, the key is the key,
 * and a field that accepts typing invites a correction that breaks the install
 * with no error anywhere. Code goes in Payload's `CodeEditor` with `readOnly`,
 * for its highlighting and line numbers; a single value stays a `<pre>`.
 * `CopyToClipboard` is Payload's own, so it behaves like the Reveal button
 * beside the API key rather than like a second idiom.
 */
export function CopyBlock({ snippet }: { snippet: Snippet }): React.ReactElement {
  return (
    <div className={styles.copyBlock}>
      <div className={styles.copyHeader}>
        <span className="field-label">{snippet.label}</span>
        <CopyToClipboard value={snippet.value} />
      </div>
      {snippet.kind === 'text' ? (
        <pre className={styles.copyValue}>{snippet.value}</pre>
      ) : (
        <CodeEditor language={snippet.kind} maxHeight={384} readOnly value={snippet.value} />
      )}
    </div>
  )
}

export default CopyBlock
