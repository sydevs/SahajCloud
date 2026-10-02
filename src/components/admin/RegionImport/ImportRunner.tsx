'use client'

import type { ResolveReport } from './runPlan'
import type { Option } from '@payloadcms/ui/elements/ReactSelect'

import { Banner, Button, Dropzone, SelectInput, useLocale } from '@payloadcms/ui'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ImportReview } from './ImportReview'
import { importStepUrl, NO_LOCALE_REFUSAL, refusalMessage } from './importUrls'
import { resolveProgress, resolveSummary, resolveVerdict, STALLED_REFUSAL } from './runPlan'

export interface ImportRunnerProps {
  readonly regionId: number
  /** `config.routes.api`, read on the server so the client needs no `useConfig`. */
  readonly apiRoute: string
  /** The admin locale's own language — what a blank `languages` column means. */
  readonly defaultLanguages: string[]
  readonly languageOptions: { label: string; value: string }[]
}

type Phase = 'idle' | 'uploading' | 'resolving' | 'proposing' | 'reviewing' | 'failed'

/** The counts `POST /:id/propose` answers with, beside the tree itself. */
interface ProposeReport {
  creating: number
  existing: number
  rowErrors: number
}

/**
 * Stages a CSV against this region and runs it up to a reviewable batch.
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
 * So the file and the languages are offered only while there is no batch.
 */
export const ImportRunner = ({
  apiRoute,
  defaultLanguages,
  languageOptions,
  regionId,
}: ImportRunnerProps) => {
  const { code: locale } = useLocale()
  const [file, setFile] = useState<File | null>(null)
  const [languages, setLanguages] = useState<string[]>(defaultLanguages)
  const [phase, setPhase] = useState<Phase>('idle')
  const [batchId, setBatchId] = useState<null | number>(null)
  const [resolved, setResolved] = useState<null | ResolveReport>(null)
  const [proposed, setProposed] = useState<null | ProposeReport>(null)
  const [refusal, setRefusal] = useState<null | string>(null)

  // ⚠ **A ref, because `busy` cannot bound this.** `busy` is derived from
  // `phase`, and the state behind it has not been applied yet when a second
  // click lands in the same tick — so a double-click on a disabled-looking
  // button stages two batches, which then shadow each other as duplicates.
  const running = useRef(false)

  // The loop outlives a click away from the tab, and writing state afterwards
  // is a React warning stacked on whatever else went wrong.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async () => {
    const fail = (message: string) => {
      if (!mounted.current) return
      setRefusal(message)
      setPhase('failed')
    }

    if (running.current) return
    running.current = true
    setRefusal(null)
    let id = batchId

    try {
      if (id === null) {
        if (!file) return
        const url = importStepUrl({ apiRoute, locale, step: 'upload' })
        if (!url) return fail(NO_LOCALE_REFUSAL)

        setPhase('uploading')
        const staged = await post(url, {
          csv: await file.text(),
          defaultLanguages: languages,
          targetRegion: regionId,
        })
        if (!mounted.current) return
        if (!staged.ok) return fail(refusalMessage(staged.body, 'The file could not be staged.'))

        id = (staged.body as { id: number }).id
        setBatchId(id)
      }

      const resolveUrl = importStepUrl({ apiRoute, batchId: id, locale, step: 'resolve' })
      if (!resolveUrl) return fail(NO_LOCALE_REFUSAL)

      setPhase('resolving')
      let previousPending: null | number = null
      for (;;) {
        const chunk = await post(resolveUrl)
        if (!mounted.current) return
        // A refusal here is the geocoder far more often than the batch, and
        // whatever the chunk managed is already stored — which is what makes
        // Resume cheap rather than a second pass over the same addresses.
        if (!chunk.ok) return fail(refusalMessage(chunk.body, 'The rows could not be checked.'))

        const report = chunk.body as ResolveReport
        setResolved(report)
        const verdict = resolveVerdict(previousPending, report)
        if (verdict === 'stalled') return fail(STALLED_REFUSAL)
        if (verdict === 'propose') break
        previousPending = report.pending
      }

      const proposeUrl = importStepUrl({ apiRoute, batchId: id, locale, step: 'propose' })
      if (!proposeUrl) return fail(NO_LOCALE_REFUSAL)

      setPhase('proposing')
      const tree = await post(proposeUrl)
      if (!mounted.current) return
      if (!tree.ok) return fail(refusalMessage(tree.body, 'The regions could not be proposed.'))

      setProposed(tree.body as ProposeReport)
      setPhase('reviewing')
    } catch {
      // `fetch` rejects on a dropped connection rather than answering, and the
      // only handler above this is the click, which cannot report anything.
      // Without this the run would stay `busy` with no way back to Resume.
      fail('The import could not be reached. Check your connection, then resume.')
    } finally {
      running.current = false
    }
  }, [apiRoute, batchId, file, languages, locale, regionId])

  const busy = phase === 'uploading' || phase === 'resolving' || phase === 'proposing'

  return (
    <div className="region-import__run">
      {batchId === null ? (
        <>
          <Dropzone disabled={busy} onChange={(files) => setFile(files.item(0))}>
            <p className="region-import__drop">
              {file ? file.name : 'Drop the filled-in template here, or choose a file.'}
            </p>
          </Dropzone>
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

      {busy ? <RunProgress phase={phase} resolved={resolved} /> : null}
      {refusal ? <Banner type="error">{refusal}</Banner> : null}

      {phase === 'reviewing' && batchId !== null && resolved && proposed ? (
        <>
          <Banner type="success">{`${resolveSummary(resolved)} ${proposalSummary(proposed)}`}</Banner>
          <ImportReview apiRoute={apiRoute} batchId={batchId} />
        </>
      ) : (
        <Button
          disabled={busy || (batchId === null && (!file || languages.length === 0))}
          onClick={() => void run()}
        >
          {batchId === null ? 'Check this file' : 'Resume'}
        </Button>
      )}
    </div>
  )
}

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

async function post(url: string, body?: unknown): Promise<{ body: unknown; ok: boolean }> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
  })
  return { body: await response.json().catch(() => null), ok: response.ok }
}

/** The codes behind react-select's answer, which is one option or many. */
function selectedValues(selected: Option | Option[]): string[] {
  return (Array.isArray(selected) ? selected : [selected])
    .map((option) => option?.value)
    .filter((value): value is string => typeof value === 'string')
}

/** What the proposal came to — the half the review step is about. */
function proposalSummary({ creating, existing, rowErrors }: ProposeReport): string {
  const parts = [`${creating} new region${creating === 1 ? '' : 's'}`]
  if (existing) parts.push(`${existing} already in the Atlas`)
  if (rowErrors) parts.push(`${rowErrors} more rows skipped`)
  return `${parts.join(', ')}.`
}
