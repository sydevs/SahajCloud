'use client'

import { useAuth, useDocumentInfo, useFormFields } from '@payloadcms/ui'

/**
 * Where "Import classes" points for the region on screen, or `null` where it is
 * not offered: an unsaved region nothing can target, a venue with no cities to
 * file under, or a manager who cannot create an import.
 *
 * Two surfaces offer it — the Events tab's heading, which a country and a
 * region no longer render, and the edit menu, which every level does — so the
 * answer belongs to neither.
 */
export const useImportClassesTarget = (): string | null => {
  const { id } = useDocumentInfo()
  const { permissions } = useAuth()
  const level = useFormFields(([fields]) => fields.level?.value)

  if (!id || level === 'venue' || !permissions?.collections?.imports?.create) return null

  return `/admin/collections/imports/create?targetRegion=${id}`
}
