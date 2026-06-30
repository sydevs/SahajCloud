'use client'

import React, { useState } from 'react'

/**
 * Collapses the overflow event rows (everything past the first 8) behind a
 * Show more / Show less toggle. Children are server-rendered and only mounted
 * once expanded.
 */
export function ShowMore({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {open ? children : null}
      <button
        className="nav__link"
        onClick={() => setOpen((value) => !value)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          width: '100%',
          color: 'var(--theme-elevation-500)',
        }}
        type="button"
      >
        {open ? 'Show less' : `Show ${count} more`}
      </button>
    </>
  )
}
