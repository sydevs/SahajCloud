'use client'

import {
  FormSubmit,
  SaveDraftButton,
  useDocumentInfo,
  useForm,
  useTranslation,
} from '@payloadcms/ui'
import { useCallback } from 'react'

/**
 * A SaveDraftButton that shows "Next step" during CREATE and "Save draft" during UPDATE.
 * Used for collections where creation is just the first step in a multi-step workflow.
 */
export default function NextStepButton() {
  const { id } = useDocumentInfo()
  const { submit } = useForm()
  const { t } = useTranslation()

  // Show "Next step" when creating (no id = CREATE operation)
  if (!id) {
    const handleSaveDraft = useCallback(() => {
      void submit({
        overrides: { _status: 'draft' },
        skipValidation: true,
      })
    }, [submit])

    return (
      <FormSubmit buttonStyle="primary" onClick={handleSaveDraft} type="button">
        {t('general:next')}
      </FormSubmit>
    )
  }

  // Show default "Save draft" when editing (has id = UPDATE operation)
  return <SaveDraftButton />
}
