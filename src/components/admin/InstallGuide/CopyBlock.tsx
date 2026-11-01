'use client'

import type { Snippet } from './steps'

import { CopyToClipboard } from '@payloadcms/ui'
import React from 'react'

import styles from './InstallGuide.module.css'

/**
 * One value a volunteer has to get into another system, with a Copy button.
 *
 * ⚠ **A read-only `<pre>`, never an editor.** Nothing here is the volunteer's to
 * change: the router code has to agree with the endpoint, the key is the key,
 * and a field that accepts typing invites a correction that breaks the install
 * with no error anywhere. `CopyToClipboard` is Payload's own, so it behaves like
 * the Reveal button beside the API key rather than like a second idiom.
 */
export function CopyBlock({ snippet }: { snippet: Snippet }): React.ReactElement {
  return (
    <div className={styles.copyBlock}>
      <div className={styles.copyHeader}>
        <span className={styles.copyLabel}>{snippet.label}</span>
        <CopyToClipboard value={snippet.value} />
      </div>
      <pre className={snippet.kind === 'text' ? styles.copyValue : styles.copyCode}>
        {snippet.value}
      </pre>
    </div>
  )
}

export default CopyBlock
