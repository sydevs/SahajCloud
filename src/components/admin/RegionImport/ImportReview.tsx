'use client'

import type { MappableRegion, ReviewAnswer } from './reviewModel'

import { Banner, Button, Table, TextInput, useLocale } from '@payloadcms/ui'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'

import type { TreeEdit } from '@/collections/EventImports/propose/edit'
import type { ProposedNode } from '@/collections/EventImports/propose/tree'

import { tableColumn } from '../tableColumn'
import {
  batchDocumentUrl,
  importStepUrl,
  NO_LOCALE_REFUSAL,
  refusalMessage,
  sendImportRequest,
} from './importUrls'
import {
  childrenByParent,
  commitDoneNote,
  commitProgressNote,
  commitVerdict,
  COMMIT_STALLED_REFUSAL,
  COORDINATOR_LABEL,
  coordinatorNote,
  DISCARD_CONFIRM,
  isEditableNode,
  mappableFor,
  mergedNote,
  nodeCountNote,
  nodeMatchNote,
  ROW_STATUS_LABEL,
  stateLayerNote,
  treeNote,
  type CommitChunk,
  type FinishedChunk,
} from './reviewModel'

export interface ImportReviewProps {
  readonly batchId: number
  /** `config.routes.api`, read on the server so the client needs no `useConfig`. */
  readonly apiRoute: string
}

type Phase = 'committed' | 'committing' | 'discarded' | 'editing' | 'failed' | 'loading' | 'ready'

/**
 * The batch a reviewer approves, or discards, before any class is created.
 *
 * `GET /:id/review` is the whole surface in one answer, and it is re-read after
 * every edit rather than patched locally: a rename reassigns slugs across the
 * tree and a mapping can prune a state that is now empty, so the tree a reviewer
 * sees next is the stored one and not this component's guess at it
 * (`endpoints/tree.ts`).
 *
 * ⚠ **The commit is the point of no return, and it is chunked.** Each call
 * creates up to 20 classes and the last one deletes the batch, so the loop's
 * final response is the only account of the import anyone gets — which is why the
 * outcome stays on screen instead of this component reloading itself.
 */
export const ImportReview = ({ apiRoute, batchId }: ImportReviewProps) => {
  const { code: locale } = useLocale()
  const [phase, setPhase] = useState<Phase>('loading')
  const [answer, setAnswer] = useState<null | ReviewAnswer>(null)
  const [progress, setProgress] = useState<null | CommitChunk>(null)
  const [outcome, setOutcome] = useState<null | FinishedChunk>(null)
  const [refusal, setRefusal] = useState<null | string>(null)
  const [pruned, setPruned] = useState<string[]>([])

  // ⚠ **A ref, because a derived `busy` cannot bound this.** The state behind it
  // has not been applied when a second click lands in the same tick, and a
  // doubled commit is two chunks writing the same rows.
  const running = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const fail = useCallback((message: string) => {
    if (!mounted.current) return
    setRefusal(message)
    setPhase('failed')
  }, [])

  const load = useCallback(async () => {
    const url = importStepUrl({ apiRoute, batchId, locale, step: 'review' })
    if (!url) return fail(NO_LOCALE_REFUSAL)

    const read = await sendImportRequest(url, 'GET')
    if (!mounted.current) return
    if (!read.ok) return fail(refusalMessage(read.body, 'This batch could not be read.'))

    setAnswer(read.body as ReviewAnswer)
    setRefusal(null)
    setPhase('ready')
  }, [apiRoute, batchId, fail, locale])

  // ⚠ **Terminal phases are never reloaded.** `load`'s identity changes with the
  // admin locale, so without this gate switching language after a commit re-reads
  // a batch the finish already deleted — a 404 that replaces the committed and
  // skipped lines with a refusal, and they exist nowhere else.
  const terminal = phase === 'committed' || phase === 'discarded'
  useEffect(() => {
    if (terminal) return
    void load().catch(() => fail(UNREACHABLE_REFUSAL))
  }, [fail, load, terminal])

  const applyEdit = useCallback(
    async (edit: TreeEdit) => {
      if (running.current) return
      running.current = true
      setRefusal(null)
      try {
        const url = importStepUrl({ apiRoute, batchId, locale, step: 'tree' })
        if (!url) return fail(NO_LOCALE_REFUSAL)

        setPhase('editing')
        const edited = await sendImportRequest(url, 'POST', { edits: [edit] })
        if (!mounted.current) return
        if (!edited.ok) {
          // The stored tree is untouched by a refused edit (all or nothing), so
          // the surface goes back to what it was showing rather than reloading.
          setRefusal(refusalMessage(edited.body, 'That change could not be applied.'))
          setPhase('ready')
          return
        }
        // ⚠ **Read before the reload throws it away.** A mapping that empties a
        // state drops that node, and the reloaded tree simply no longer has it —
        // so this is the only moment the surface can say which ones went.
        const dropped = (edited.body as { pruned?: unknown }).pruned
        setPruned(Array.isArray(dropped) ? dropped.filter((key) => typeof key === 'string') : [])
        await load()
      } catch {
        fail(UNREACHABLE_REFUSAL)
      } finally {
        running.current = false
      }
    },
    [apiRoute, batchId, fail, load, locale],
  )

  const commit = useCallback(async () => {
    if (running.current) return
    running.current = true
    setRefusal(null)
    try {
      const url = importStepUrl({ apiRoute, batchId, locale, step: 'commit' })
      if (!url) return fail(NO_LOCALE_REFUSAL)

      setPhase('committing')
      let previousPending: null | number = null
      for (;;) {
        const chunk = await sendImportRequest(url, 'POST')
        if (!mounted.current) return
        // Whatever the chunk created is already recorded on the batch, so a
        // refusal here leaves somewhere to resume from rather than a half-import
        // nobody can account for.
        if (!chunk.ok) return fail(refusalMessage(chunk.body, 'The classes could not be created.'))

        const report = chunk.body as CommitChunk
        setProgress(report)
        const verdict = commitVerdict(previousPending, report)
        if (verdict === 'stalled') return fail(COMMIT_STALLED_REFUSAL)
        if (verdict === 'done') {
          // `finished` rides only on the call that ends the commit, and the batch
          // is deleted by it — so a response without one is a bug we must not
          // render as a success.
          if (!report.finished) return fail(MISSING_REPORT_REFUSAL)
          setOutcome(report as FinishedChunk)
          setPhase('committed')
          return
        }
        previousPending = report.pending
      }
    } catch {
      fail(UNREACHABLE_REFUSAL)
    } finally {
      running.current = false
    }
  }, [apiRoute, batchId, fail, locale])

  const discard = useCallback(async () => {
    if (running.current) return
    if (!window.confirm(DISCARD_CONFIRM)) return
    running.current = true
    setRefusal(null)
    try {
      const url = batchDocumentUrl({ apiRoute, batchId, locale })
      if (!url) return fail(NO_LOCALE_REFUSAL)

      const trashed = await sendImportRequest(url, 'PATCH', { deletedAt: new Date().toISOString() })
      if (!mounted.current) return
      if (!trashed.ok) {
        return fail(refusalMessage(trashed.body, 'This batch could not be discarded.'))
      }
      setPhase('discarded')
    } catch {
      fail(UNREACHABLE_REFUSAL)
    } finally {
      running.current = false
    }
  }, [apiRoute, batchId, fail, locale])

  if (phase === 'discarded') {
    // ⚠ **Not "restore it yourself".** The collection is `admin.hidden`, which
    // unregisters its routes, so there is no trash view a volunteer can reach —
    // recovering a batch inside the window is an admin's job. What this owes them
    // is that nothing in the Atlas moved, and that the file is not gone yet.
    return (
      <Banner type="info">
        Batch discarded — nothing already in the Atlas changed. Ask an admin within 7 days if you
        discarded it by mistake.
      </Banner>
    )
  }

  if (phase === 'committed' && outcome) {
    return <OutcomeReport outcome={outcome} />
  }

  // ⚠ **A half-written commit is a frozen tree.** `POST /:id/tree` 409s for a
  // `committing` batch, so offering a rename on one reads as the control being
  // broken rather than as the batch having moved on.
  const busy = phase === 'committing' || phase === 'editing' || answer?.status === 'committing'
  const stateLayer = answer ? stateLayerNote(answer.proposedRegions) : null

  return (
    <div className="region-import__review">
      {refusal ? <Banner type="error">{refusal}</Banner> : null}
      {answer?.warning ? <Banner type="info">{answer.warning}</Banner> : null}
      {pruned.length ? (
        <Banner type="info">
          {`${pruned.length} proposed region${pruned.length === 1 ? '' : 's'} held nothing after that change, so ${pruned.length === 1 ? 'it is' : 'they are'} no longer in the tree.`}
        </Banner>
      ) : null}

      {phase === 'loading' ? <p>Reading the batch…</p> : null}
      {progress?.warning ? <Banner type="info">{progress.warning}</Banner> : null}
      {phase === 'committing' ? (
        <p>{progress ? commitProgressNote(progress) : 'Creating the regions…'}</p>
      ) : null}

      {answer ? (
        <>
          <p>{treeNote(answer)}</p>
          <p>{coordinatorNote(answer.coordinators)}</p>
          {stateLayer ? <p>{stateLayer}</p> : null}

          <h3>Regions</h3>
          <TreeLevel
            busy={busy}
            mappable={answer.mappable}
            nodes={childrenByParent(answer.proposedRegions.nodes)}
            onEdit={(edit) => void applyEdit(edit)}
            parentKey={null}
          />

          <h3>Lines</h3>
          <RowTable rows={answer.rows} />

          <div className="region-import__review-actions">
            <Button disabled={busy} onClick={() => void commit()}>
              {answer.status === 'committing' || progress
                ? 'Resume creating the classes'
                : 'Create the classes'}
            </Button>
            <Button buttonStyle="secondary" disabled={busy} onClick={() => void discard()}>
              Discard this batch
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}

interface TreeLevelProps {
  readonly nodes: Map<null | string, ProposedNode[]>
  readonly parentKey: null | string
  readonly mappable: readonly MappableRegion[]
  readonly busy: boolean
  readonly onEdit: (edit: TreeEdit) => void
}

/** One level of the proposed tree, nested so the hierarchy reads without styling. */
const TreeLevel = ({ busy, mappable, nodes, onEdit, parentKey }: TreeLevelProps) => {
  const level = nodes.get(parentKey) ?? []
  if (!level.length) return null

  return (
    <ul className="region-import__tree">
      {level.map((node) => (
        <li key={node.key}>
          <TreeNode busy={busy} mappable={mappable} node={node} onEdit={onEdit} />
          <TreeLevel
            busy={busy}
            mappable={mappable}
            nodes={nodes}
            onEdit={onEdit}
            parentKey={node.key}
          />
        </li>
      ))}
    </ul>
  )
}

interface TreeNodeProps {
  readonly node: ProposedNode
  readonly mappable: readonly MappableRegion[]
  readonly busy: boolean
  readonly onEdit: (edit: TreeEdit) => void
}

/**
 * One proposed region, with the two edits it accepts where it accepts them.
 *
 * ⚠ **The mapping control is a native `<select>`, not `SelectInput`.** That
 * wrapper is a react-select widget, and this is one control per node inside a
 * nested list rather than a field in a form — so it would need a `path` that
 * addresses nothing, and a spec asserting what a reviewer picked would have to
 * reproduce react-select's own `Option`-shaped `onChange` to do it. The rename box
 * is Payload's `TextInput`, which has neither problem.
 */
const TreeNode = ({ busy, mappable, node, onEdit }: TreeNodeProps) => {
  const [draft, setDraft] = useState(node.name)
  const candidates = mappableFor(mappable, node)
  const editable = isEditableNode(node)
  const merged = mergedNote(node)

  return (
    <div className="region-import__node">
      <span>
        <strong>{node.name}</strong> — {node.level}, {nodeCountNote(node)}, {nodeMatchNote(node)}
        {node.slug ? ` (${node.slug})` : ''}
      </span>
      {merged ? <span className="region-import__merged">{merged}</span> : null}

      {editable ? (
        <div className="region-import__node-edit">
          <TextInput
            label={`Rename ${node.name}`}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
            path={`rename-${node.key}`}
            readOnly={busy}
            value={draft}
          />
          <Button
            buttonStyle="secondary"
            disabled={busy || !draft.trim() || draft.trim() === node.name}
            onClick={() => onEdit({ kind: 'rename', key: node.key, name: draft.trim() })}
          >
            Rename
          </Button>

          {candidates.length ? (
            <label>
              {`Map ${node.name} onto an existing region`}
              <select
                disabled={busy}
                onChange={(event) => {
                  const regionId = Number(event.target.value)
                  if (regionId) onEdit({ kind: 'map', key: node.key, regionId })
                }}
                value=""
              >
                <option value="">Create it</option>
                {candidates.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Every line of the file and what the commit will do with it.
 *
 * Payload's own `Table` rather than markup of ours, so this reads as a list view
 * (`docs/rules/admin-ui.md`). It renders one pre-rendered node per cell and
 * exposes nothing per row, which is all this needs — a line is read, never
 * opened.
 */
const RowTable = ({ rows }: { readonly rows: ReviewAnswer['rows'] }) => {
  if (!rows.length) return <p>This batch holds no lines.</p>

  return (
    <Table
      appearance="condensed"
      columns={[
        tableColumn('line', 'Line', rows.map((row) => row.line)),
        tableColumn('title', 'Title', rows.map((row) => row.title ?? '—')),
        tableColumn('place', 'Place', rows.map((row) => row.place ?? '—')),
        tableColumn('status', 'Status', rows.map((row) => ROW_STATUS_LABEL[row.status])),
        tableColumn(
          'coordinator',
          'Coordinator',
          rows.map((row) => COORDINATOR_LABEL[row.coordinator]),
        ),
        tableColumn('reasons', 'Why', rows.map((row) => row.reasons.join('; '))),
      ]}
      data={rows.map((row) => ({ id: row.line }))}
    />
  )
}

/**
 * What the import came to.
 *
 * ⚠ **This never reloads itself.** The batch is hard-deleted by the call that
 * answered, so every line and reason below is unrecoverable once it leaves the
 * screen (`commit/summary.ts`).
 */
const OutcomeReport = ({ outcome }: { readonly outcome: FinishedChunk }) => {
  const { finished } = outcome
  return (
  <div className="region-import__outcome">
    <Banner type="success">{commitDoneNote(outcome)}</Banner>
    {finished.summaryEmailed ? null : (
      <Banner type="info">The summary email did not go out. The classes were still created.</Banner>
    )}
    {/* ⚠ The batch should be gone by now. One that survives keeps the uploaded
        CSV — contact names, phone numbers, addresses — and `PurgeEventImports`
        will not take it, because nothing trashed it. */}
    {finished.deleted ? null : (
      <Banner type="error">
        The classes were created, but this batch was not deleted afterwards. Ask an admin to remove
        it — it still holds the uploaded file.
      </Banner>
    )}
    {finished.skipped.length ? (
      <>
        <h3>Lines skipped</h3>
        <ul>
          {finished.skipped.map(({ line, reasons }) => (
            <li key={line}>{`Line ${line} — ${reasons.join('; ')}`}</li>
          ))}
        </ul>
      </>
    ) : null}
  </div>
  )
}

const UNREACHABLE_REFUSAL =
  'The import could not be reached. Check your connection, then reload this tab.'

const MISSING_REPORT_REFUSAL =
  'The commit finished but reported nothing. Check the classes on the region before running it again.'

