import type { DocumentViewClientProps, DocumentViewServerProps } from 'payload'

import { Banner, DefaultEditView, Gutter, Spinner } from '@payloadcms/ui'
import { toWords } from 'payload/shared'

import { CheckAgain } from './CheckAgain'
import { type JobStageWait, jobStageWait, readJobStageConfig } from './stages'

/**
 * Every client prop, required. Each `DocumentSlots` member is optional, so a
 * slot a Payload release adds would otherwise be dropped with no type error
 * and no symptom but a missing control — keying off `Required<>` makes that
 * upgrade a TS2741 here. Keying off `Required<>` rather than mapping with
 * `-?` is load-bearing: `-?` strips `undefined` from the value type too, and
 * every slot Payload hands over is `ReactNode | undefined`.
 */
type PickedClientProps = {
  [K in keyof Required<DocumentViewClientProps>]: DocumentViewServerProps[K]
}

/**
 * Payload hands a view the server and client prop sets merged, and renders
 * `DefaultEditView` with the client half alone, so the fall-through rebuilds
 * it. Picked rather than omitted so that a prop Payload adds on the server
 * side stays there: `req` and `payload` carry methods, and a client component
 * handed either throws.
 */
function clientPropsOf(props: DocumentViewServerProps): PickedClientProps {
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

/** The count a collection publishes, as a sentence, or nothing where it publishes none. */
function countSentence({ progress, total }: JobStageWait): string {
  if (progress === null) return ''
  return total === null ? ` ${progress} done so far.` : ` ${progress} of ${total} done.`
}

/**
 * An Edit view that waits while a job owns the document, for any collection
 * declaring `admin.custom.jobStage` (`stages.ts`).
 *
 * A server component, because Payload hands a view the locale and user objects
 * (`docs/rules/admin-ui.md` § Server vs client components), and because the
 * stored stage at page load is the whole input — there is no poll, and so no
 * second request. Re-reading it is `CheckAgain`'s, the one client component
 * here.
 */
export default function JobStageView(props: DocumentViewServerProps) {
  const { collectionConfig, docID } = props.initPageResult

  // No id is the create form, which no worker can be holding.
  if (collectionConfig && docID !== undefined) {
    const config = readJobStageConfig(collectionConfig.admin?.custom)
    const wait = config && jobStageWait(config, props.doc)

    if (wait) {
      return (
        <Gutter>
          <Banner icon={<Spinner loadingText={null} size="sm" />} type="info">
            {toWords(wait.stage)} — this is being prepared automatically, and opens for editing when
            that finishes.{countSentence(wait)}
          </Banner>
          <CheckAgain />
        </Gutter>
      )
    }
  }

  return <DefaultEditView {...clientPropsOf(props)} />
}
