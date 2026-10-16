import type { DocumentViewClientProps, DocumentViewServerProps } from 'payload'

import { Banner, Button, DefaultEditView, Gutter, Spinner } from '@payloadcms/ui'
import { toWords } from 'payload/shared'

import { adminDocPath } from '@/lib/utilities/adminUrl'

import { decideJobStage, readJobStageConfig } from './stages'

/**
 * Payload hands a view the server and client prop sets merged, and renders
 * `DefaultEditView` with the client half alone, so the fall-through rebuilds
 * it. Picked rather than omitted so that a prop Payload adds on the server
 * side stays there: `req` and `payload` carry methods, and a client component
 * handed either throws.
 */
function clientPropsOf(props: DocumentViewServerProps): DocumentViewClientProps {
  return {
    BeforeDocumentControls: props.BeforeDocumentControls,
    Description: props.Description,
    documentSubViewType: props.documentSubViewType,
    EditMenuItems: props.EditMenuItems,
    formState: props.formState,
    LivePreview: props.LivePreview,
    PreviewButton: props.PreviewButton,
    PublishButton: props.PublishButton,
    SaveButton: props.SaveButton,
    SaveDraftButton: props.SaveDraftButton,
    Status: props.Status,
    UnpublishButton: props.UnpublishButton,
    Upload: props.Upload,
    UploadControls: props.UploadControls,
    viewType: props.viewType,
  }
}

/**
 * An Edit view that waits while a job owns the document, for any collection
 * declaring `admin.custom.jobStage` (`stages.ts`).
 *
 * A server component, because Payload hands a view the locale and user objects
 * (`docs/rules/admin-ui.md` § Server vs client components), and because the
 * stored stage at page load is the whole input — there is no poll, and so no
 * second request. **Continue** is therefore an `<a href>` and not a
 * `next/link`: a full load re-reads the stage on the server, where a client
 * navigation can be served from the route cache and show the same stale
 * waiting view again.
 */
export default function JobStageView(props: DocumentViewServerProps) {
  const { collectionConfig, docID } = props.initPageResult
  const config = readJobStageConfig(collectionConfig?.admin?.custom)

  // No id is the create form, which no worker can be holding. Without this a
  // collection whose running stage is also its `defaultValue` would open every
  // new document behind the waiting view, with nothing able to move it on.
  if (config && collectionConfig && docID !== undefined) {
    const decision = decideJobStage(config, props.doc)

    if (decision.waiting) {
      return (
        <Gutter>
          <Banner icon={<Spinner loadingText={null} size="sm" />} type="info">
            {toWords(decision.stage)} — a job owns this document. Editing opens when it finishes.
            {decision.progress === null ? '' : ` ${decision.progress} done so far.`}
          </Banner>
          <Button
            buttonStyle="secondary"
            el="anchor"
            url={adminDocPath(collectionConfig.slug, docID)}
          >
            Continue
          </Button>
        </Gutter>
      )
    }
  }

  return <DefaultEditView {...clientPropsOf(props)} />
}
