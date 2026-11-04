'use client'

import { useDocumentDrawer } from '@payloadcms/ui'
import React from 'react'

/**
 * A document named in the submission summary, opened in Payload's own document
 * drawer — the same thing a relationship field's chip does, so a reader stays
 * on the submission. `overrideEntityVisibility` keeps it working for a
 * collection hidden from the nav (`users` is, for non-admins).
 */
export const SummaryLink: React.FC<{ collectionSlug: string; id: number; label: string }> = ({
  collectionSlug,
  id,
  label,
}) => {
  const [Drawer, Toggler] = useDocumentDrawer({
    collectionSlug,
    id,
    overrideEntityVisibility: true,
  })

  return (
    <>
      <Toggler className="submission-summary__link">{label}</Toggler>
      <Drawer />
    </>
  )
}
