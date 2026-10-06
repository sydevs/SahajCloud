'use client'

import type { OpenBatch, ResolveReport } from './runPlan'
import type { Option } from '@payloadcms/ui/elements/ReactSelect'

import { Banner, Button, Dropzone, SelectInput, useLocale } from '@payloadcms/ui'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'

import { readImportFile } from './importFile'
import { ImportReview } from './ImportReview'
import {
  batchDocumentUrl,
  importStepUrl,
  NO_LOCALE_REFUSAL,
  refusalMessage,
  sendImportRequest,
} from './importUrls'
import {
  resolveProgress,
  resumeStep,
  resolveSummary,
  resolveVerdict,
  STALLED_REFUSAL,
} from './runPlan'
import { useLeaveWarning } from './useLeaveWarning'

export interface ImportRunnerProps {
  readonly regionId: number
  /** `config.routes.api`, read on the server so the client needs no `useConfig`. */
  readonly apiRoute: string
  /** The admin locale's own language — what a blank `languages` column means. */
  readonly defaultLanguages: string[]
  readonly languageOptions: { label: string; value: string }[]
  /** The caller's unfinished batches into this region, newest first. */
  readonly openBatches: readonly OpenBatch[]
}

type Phase = 'idle' | 'uploading' | 'resolving' | 'proposing' | 'reviewing' | 'failed'

/**
 * Stages a CSV against this region and runs it up to a reviewable batch — or
 * picks an unfinished one back up.
 *
 * Three endpoints in one gesture: the upload stages the file, the resolve step
 * geocodes it a chunk at a time, and the proposal works out the regions those
 * classes need. They are separate requests because each is bounded — 500 rows
 * against Mapbox is minutes of work — and one button because a volunteer has no
 * decision to make in between.
 *
 * ⚠ **A failed run resumes; it never re-uploads.** Rows that already geocoded
 * carry their answers on the batch, so running the loop again against the same
 * id asks Mapbox nothing twice. Uploading the file a second time would stage a
 * second batch instead, and the two would then shadow each other as duplicates.
 * So the file and the languages are offered only while there is no batch — and
 * "Discard and start over" is how a volunteer gets them back.
 *
 * ⚠ **The batch id rides in the URL (`?batch=`).** A reload, or the volunteer
 * coming back to the tab, lands on the same batch rather than an empty form; the
 * Import tab also lists every unfinished batch (`openBatches`).
 */
export const ImportRunner = ({
  apiRoute,
  defaultLanguages,
  languageOptions,
  openBatches,
  regionId,
}: ImportRunnerProps) => {
  const { code: locale } = useLocale()
  const [file, setFile] = useState<File | null>(null)
  const [languages, setLanguages] = useState<string[]>(defaultLanguages)
  const [phase, setPhase] = useState<Phase>('idle')
  const [batchId, setBatchId] = useState<null | number>(null)
  const [resolved, setResolved] = useState<null | ResolveReport>(null)
  const [refusal, setRefusal] = useState<null | string>(null)
  const [warning, setWarning] = useState<null | string>(null)
  const [batches, setBatches] = useState<readonly OpenBatch[]>(openBatches)
  const fileInput = useRef<HTMLInputElement>(null)

  // ⚠ **A ref, because `busy` cannot bound this.** `busy` is derived from
  // `phase`, and the state behind it has not been applied yet when a second
  // click lands in the same tick — so a double-click on a disabled-looking
  // button stages two batches, which then shadow each other as duplicates.
  const running = useRef(false)

  // ⚠ **The loop stops when the tab unmounts.** The batch keeps what it has, and
  // the Import tab offers it back, so nothing is lost by stopping — whereas
  // writing state afterwards is a React warning stacked on whatever else went
  // wrong.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const busy = phase === 'uploading' || phase === 'resolving' || phase === 'proposing'
  useLeaveWarning(busy)

  const selectBatch = useCallback((id: null | number) => {
    setBatchId(id)
    setBatchInUrl(id)
  }, [])

  const run = useCallback(
    async (resumeId?: number) => {
      const fail = (message: string) => {
        if (!mounted.current) return
        setRefusal(message)
        setPhase('failed')
      }

      if (running.current) return
      running.current = true
      setRefusal(null)
      let id = resumeId ?? batchId

      try {
        if (id === null) {
          if (!file) return
          const url = importStepUrl({ apiRoute, locale, step: 'upload' })
          if (!url) return fail(NO_LOCALE_REFUSAL)

          setPhase('uploading')
          const read = await readImportFile(file)
          if (!read.ok) return fail(read.error)
          const staged = await sendImportRequest(url, 'POST', {
            csv: read.text,
            defaultLanguages: languages,
            targetRegion: regionId,
          })
          if (!mounted.current) return
          if (!staged.ok) {
            return fail(refusalMessage(staged.body, 'The file could not be staged.', staged.status))
          }

          const body = staged.body as { id: number; warning?: string }
          id = body.id
          if (body.warning) setWarning(body.warning)
          selectBatch(id)
        }

        const resolveUrl = importStepUrl({ apiRoute, batchId: id, locale, step: 'resolve' })
        if (!resolveUrl) return fail(NO_LOCALE_REFUSAL)

        setPhase('resolving')
        let previousPending: null | number = null
        for (;;) {
          const chunk = await sendImportRequest(resolveUrl, 'POST')
          if (!mounted.current) return
          // A refusal here is the geocoder far more often than the batch, and
          // whatever the chunk managed is already stored — which is what makes
          // Resume cheap rather than a second pass over the same addresses.
          if (!chunk.ok) {
            return fail(refusalMessage(chunk.body, 'The rows could not be checked.', chunk.status))
          }

          const report = chunk.body as ResolveReport & { warning?: string }
          setResolved(report)
          if (report.warning) setWarning(report.warning)
          const verdict = resolveVerdict(previousPending, report)
          if (verdict === 'stalled') return fail(STALLED_REFUSAL)
          if (verdict === 'propose') break
          previousPending = report.pending
        }

        const proposeUrl = importStepUrl({ apiRoute, batchId: id, locale, step: 'propose' })
        if (!proposeUrl) return fail(NO_LOCALE_REFUSAL)

        setPhase('proposing')
        const tree = await sendImportRequest(proposeUrl, 'POST')
        if (!mounted.current) return
        if (!tree.ok) {
          return fail(refusalMessage(tree.body, 'The regions could not be proposed.', tree.status))
        }

        setPhase('reviewing')
      } catch {
        // `fetch` rejects on a dropped connection rather than answering, and the
        // only handler above this is the click, which cannot report anything.
        // Without this the run would stay `busy` with no way back to Resume.
        fail('The import could not be reached. Check your connection, then resume.')
      } finally {
        running.current = false
      }
    },
    [apiRoute, batchId, file, languages, locale, regionId, selectBatch],
  )

  const resume = useCallback(
    (batch: OpenBatch) => {
      if (running.current) return
      selectBatch(batch.id)
      setRefusal(null)
      if (resumeStep(batch) === 'review') setPhase('reviewing')
      else void run(batch.id)
    },
    [run, selectBatch],
  )

  // A reload lands back on the batch its URL names, where the caller still has it.
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    const fromUrl = batchFromUrl()
    const batch = fromUrl === null ? undefined : openBatches.find(({ id }) => id === fromUrl)
    if (batch) {
      selectBatch(batch.id)
      if (resumeStep(batch) === 'review') setPhase('reviewing')
    } else if (fromUrl !== null) setBatchInUrl(null)
  }, [openBatches, selectBatch])

  const discard = useCallback(
    async (id: number) => {
      if (running.current) return
      if (!window.confirm(DISCARD_RUNNER_CONFIRM)) return
      running.current = true
      try {
        const url = batchDocumentUrl({ apiRoute, batchId: id, locale })
        if (!url) return setRefusal(NO_LOCALE_REFUSAL)
        const trashed = await sendImportRequest(url, 'PATCH', {
          deletedAt: new Date().toISOString(),
        })
        if (!mounted.current) return
        if (!trashed.ok) {
          setRefusal(
            refusalMessage(trashed.body, 'This batch could not be discarded.', trashed.status),
          )
          return
        }
        setBatches((current) => current.filter((batch) => batch.id !== id))
        if (id === batchId) {
          selectBatch(null)
          setResolved(null)
          setPhase('idle')
        }
        setRefusal(null)
      } catch {
        setRefusal('The import could not be reached. Check your connection, then try again.')
      } finally {
        running.current = false
      }
    },
    [apiRoute, batchId, locale, selectBatch],
  )

  if (phase === 'reviewing' && batchId !== null) {
    return (
      <div className="region-import__run">
        {warning ? <Banner type="info">{warning}</Banner> : null}
        {/* The rows only. The regions this batch needs are the review's own
            first line (`treeNote`), and a second spelling of them stacked
            directly above it is two numbers a reader has to reconcile. */}
        {resolved ? <Banner type="success">{resolveSummary(resolved)}</Banner> : null}
        <ImportReview apiRoute={apiRoute} batchId={batchId} />
      </div>
    )
  }

  const others = batches.filter((batch) => batch.id !== batchId)

  return (
    <div className="region-import__run">
      {batchId === null && others.length ? (
        <div className="region-import__open">
          <h3>Unfinished imports</h3>
          <ul>
            {others.map((batch) => (
              <li key={batch.id}>
                {`Batch #${batch.id} — ${OPEN_STATUS_LABEL[batch.status]}, last touched ${new Date(batch.updatedAt).toLocaleString()}`}{' '}
                <Button buttonStyle="secondary" disabled={busy} onClick={() => resume(batch)}>
                  {batch.status === 'committing' ? 'Finish it' : 'Resume'}
                </Button>
                {batch.status === 'committing' ? null : (
                  <Button
                    buttonStyle="secondary"
                    disabled={busy}
                    onClick={() => void discard(batch.id)}
                  >
                    Discard
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {batchId === null ? (
        <>
          <Dropzone disabled={busy} onChange={(files) => setFile(files.item(0))}>
            <p className="region-import__drop">
              {file ? file.name : 'Drop the filled-in template here, or choose the file below.'}
            </p>
          </Dropzone>
          {/* ⚠ Payload's `Dropzone` takes a drop or a paste and nothing else —
              no click, no keyboard — so without this input a volunteer on a
              tablet, or one using a keyboard or a screen reader, cannot upload. */}
          <input
            accept=".csv,text/csv"
            hidden
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setFile(event.target.files?.[0] ?? null)
            }
            ref={fileInput}
            type="file"
          />
          <Button
            buttonStyle="secondary"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            Choose a file
          </Button>
          <SelectInput
            hasMany
            label="Language(s) for rows that name none"
            name="defaultLanguages"
            onChange={(selected) => setLanguages(selectedValues(selected))}
            options={languageOptions}
            path="defaultLanguages"
            readOnly={busy}
            value={languages}
          />
        </>
      ) : null}

      {warning ? <Banner type="info">{warning}</Banner> : null}
      {busy ? <RunProgress phase={phase} resolved={resolved} /> : null}
      {refusal ? <Banner type="error">{refusal}</Banner> : null}

      <Button
        disabled={busy || (batchId === null && (!file || languages.length === 0))}
        onClick={() => void run()}
      >
        {batchId === null ? 'Check this file' : 'Resume'}
      </Button>
      {batchId !== null && !busy ? (
        <Button buttonStyle="secondary" onClick={() => void discard(batchId)}>
          Discard and start over
        </Button>
      ) : null}
    </div>
  )
}

const OPEN_STATUS_LABEL: Record<OpenBatch['status'], string> = {
  uploaded: 'addresses not all checked yet',
  resolved: 'ready to review',
  committing: 'part-way through creating its classes',
}

const DISCARD_RUNNER_CONFIRM =
  'Discard this batch? Nothing in the Atlas is touched, and you can upload the file again.'

const RunProgress = ({ phase, resolved }: { phase: Phase; resolved: null | ResolveReport }) => {
  if (phase === 'uploading') return <p>Reading the file…</p>
  if (phase === 'proposing') return <p>Working out which regions these classes need…</p>
  if (!resolved) return <p>Looking up the first addresses…</p>

  return (
    <p>
      {`Looking up addresses — ${resolved.total - resolved.pending} of ${resolved.total} (${Math.round(resolveProgress(resolved) * 100)}%).`}
    </p>
  )
}

function batchFromUrl(): null | number {
  const value = Number(new URL(window.location.href).searchParams.get('batch'))
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/** `replaceState`, not a navigation: the batch is the page's state, not a new page. */
function setBatchInUrl(id: null | number): void {
  const url = new URL(window.location.href)
  if (id === null) url.searchParams.delete('batch')
  else url.searchParams.set('batch', String(id))
  window.history.replaceState(window.history.state, '', url)
}

/** The codes behind react-select's answer, which is one option or many. */
function selectedValues(selected: Option | Option[]): string[] {
  return (Array.isArray(selected) ? selected : [selected])
    .map((option) => option?.value)
    .filter((value): value is string => typeof value === 'string')
}
