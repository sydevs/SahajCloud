'use client'

import { PublishButton, useDocumentInfo } from '@payloadcms/ui'

/**
 * A PublishButton that only appears during UPDATE operations.
 * Hidden when creating new documents, forcing users to save as draft first.
 * Reusable across any collection that needs this workflow.
 */
export default function UpdateOnlyPublishButton() {
  const { id } = useDocumentInfo()

  // Hide publish button when creating (no id = CREATE operation)
  if (!id) {
    return null
  }

  // Show publish button when editing (has id = UPDATE operation)
  return <PublishButton />
}
