'use client'

import { useEffect } from 'react'

/**
 * Ask before leaving a page whose run would stop with it.
 *
 * The batch keeps what it has done and the Import tab offers it back, so this is
 * a courtesy against a stray click rather than the recovery itself.
 */
export function useLeaveWarning(active: boolean): void {
  useEffect(() => {
    if (!active) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [active])
}
