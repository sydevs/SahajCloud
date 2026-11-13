'use client'

import { Spinner } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import React from 'react'

import { InfoBanner } from '@/components/admin/InfoBanner'

/**
 * The waiting view's notice and its one control, Check again — the folder's one
 * client component, since a server component cannot carry the handler.
 *
 * ⚠ Inside a document drawer nothing re-reads the stage, this call included:
 * `DocumentDrawerContent` keeps the render in React state. See
 * `docs/rules/admin-ui.md` § `JobStageView`.
 */
export function WaitingNotice({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  return (
    <InfoBanner
      action={{ label: 'Check again', onClick: () => router.refresh() }}
      icon={<Spinner loadingText={null} size="sm" />}
    >
      {children}
    </InfoBanner>
  )
}
