'use client'

import type { MappableRegion, ReviewAnswer } from './reviewModel'


import { Banner, Button, Table, TextInput, useConfig, useLocale } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'

import { skippedRowsCsv } from '@/collections/EventImports/commit/skippedCsv'
import type { TreeEdit } from '@/collections/EventImports/propose/edit'
import type { ProposedNode } from '@/collections/EventImports/propose/tree'
import type { ReviewDuplicate, ReviewRow } from '@/collections/EventImports/review/rows'

import { useLeaveWarning } from './useLeaveWarning'
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
  DUPLICATE_ACTION_LABEL,
  duplicateNote,
  invitableCount,
  isEditableNode,
  isUnmappableNode,
  mappableFor,
  mergedNote,
  needsAttention,
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
 * writes up to 20 classes; the last one reduces the batch to its report, which
 * is also emailed to the uploader and answered again to a repeated call — so a
 * lost final response is not a lost report.
 *
 * ⚠ **A batch part-way through its commit can only go forward.** Its tree and
 * its choices are frozen and it cannot be discarded (`discard.ts`), so the one
 * control offered is Resume — and it stays enabled, or a batch reopened from the
 * Import tab could never be finished.
 */
export const ImportReview = ({ apiRoute, batchId }: ImportReviewProps) => {
  const { code: locale } = useLocale()
  const [phase, setPhaseState] = useState<Phase>('loading')
  const [answer, setAnswer] = useState<null | ReviewAnswer>(null)
  const [progress, setProgress] = useState<null | CommitChunk>(null)
  const [outcome, setOutcome] = useState<null | FinishedChunk>(null)
  const [refusal, setRefusal] = useState<null | string>(null)
  const [pruned, setPruned] = useState<string[]>([])
  const [showAll, setShowAll] = useState(false)

  // ⚠ **The phase is mirrored in a ref so a late answer cannot undo a terminal
  // one.** A review read still in flight when the commit finishes would otherwise
  // replace the report with a refusal or put the controls back.
  const phaseRef = useRef<Phase>('loading')
  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next
    setPhaseState(next)
  }, [])
  const isTerminal = () => phaseRef.current === 'committed' || phaseRef.current === 'discarded'

  // ⚠ **A ref, because a derived `busy` cannot bound this.** The state behind it
  // has not been applied when a second click lands in the same tick, and a
  // doubled commit is two requests for one batch — which the lease answers with
  // a wait, but there is no reason to ask.
  const running = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useLeaveWarning(phase === 'committing')

  const fail = useCallback(
    (message: string) => {
      if (!mounted.current || isTerminal()) return
      setRefusal(message)
      setPhase('failed')
    },
    [setPhase],
  )

  const load = useCallback(
    async ({ keepPhase = false }: { keepPhase?: boolean } = {}) => {
      const url = importStepUrl({ apiRoute, batchId, locale, step: 'review' })
      if (!url) return fail(NO_LOCALE_REFUSAL)

      const read = await sendImportRequest(url, 'GET')
      if (!mounted.current || isTerminal() || phaseRef.current === 'committing') return
      if (!read.ok) {
        return fail(refusalMessage(read.body, 'This batch could not be read.', read.status))
      }

      setAnswer(read.body as ReviewAnswer)
      if (!keepPhase) {
        setRefusal(null)
        setPhase('ready')
      }
    },
    [apiRoute, batchId, fail, locale, setPhase],
  )

  // ⚠ **Neither a finished nor a running commit is reloaded.** `load`'s identity
  // changes with the admin locale, so without this gate switching language
  // mid-commit would re-read the batch under the loop, and after it would
  // replace the report with whatever the batch answered next.
  useEffect(() => {
    if (isTerminal() || phaseRef.current === 'committing') return
    void load().catch(() => fail(UNREACHABLE_REFUSAL))
  }, [fail, load])

  /** One write the surface makes, then the stored batch read back. */
  const send = useCallback(
    async (step: 'choices' | 'tree', body: unknown, fallback: string) => {
      if (running.current) return
      running.current = true
      setRefusal(null)
      try {
        const url = importStepUrl({ apiRoute, batchId, locale, step })
        if (!url) return fail(NO_LOCALE_REFUSAL)

        setPhase('editing')
        const sent = await sendImportRequest(url, 'POST', body)
        if (!mounted.current) return
        if (!sent.ok) {
          // A refused change leaves the stored batch untouched (all or
          // nothing), so the surface goes back to what it was showing.
          setRefusal(refusalMessage(sent.body, fallback, sent.status))
          setPhase('ready')
          return
        }
        // ⚠ **Read before the reload throws it away.** A mapping that empties a
        // state drops that node, and the reloaded tree simply no longer has it.
        const dropped = (sent.body as { pruned?: unknown }).pruned
        setPruned(Array.isArray(dropped) ? dropped.filter((key) => typeof key === 'string') : [])
        await load()
      } catch {
        fail(UNREACHABLE_REFUSAL)
      } finally {
        running.current = false
      }
    },
    [apiRoute, batchId, fail, load, locale, setPhase],
  )

  const applyEdit = useCallback(
    (edit: TreeEdit) => void send('tree', { edits: [edit] }, 'That change could not be applied.'),
    [send],
  )
  const choose = useCallback(
    (choice: {
      duplicates?: { line: number; action: ReviewDuplicate['action'] }[]
      inviteCoordinators?: boolean
    }) => void send('choices', choice, 'That choice could not be saved.'),
    [send],
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
        if (!chunk.ok) {
          // Whatever the chunk wrote is recorded on the batch, so this leaves
          // somewhere to resume from. The batch is read back so the surface
          // shows it as committing — frozen, and not discardable.
          setPhase('failed')
          setRefusal(refusalMessage(chunk.body, 'The classes could not be created.', chunk.status))
          void load({ keepPhase: true }).catch(() => undefined)
          return
        }

        const report = chunk.body as CommitChunk
        setProgress(report)
        const verdict = commitVerdict(previousPending, report)
        if (verdict === 'stalled') {
          setPhase('failed')
          setRefusal(COMMIT_STALLED_REFUSAL)
          void load({ keepPhase: true }).catch(() => undefined)
          return
        }
        if (verdict === 'done') {
          if (!report.finished) return fail(MISSING_REPORT_REFUSAL)
          setOutcome(report as FinishedChunk)
          setPhase('committed')
          return
        }
        previousPending = report.pending
      }
    } catch {
      setPhase('failed')
      setRefusal(UNREACHABLE_REFUSAL)
    } finally {
      running.current = false
    }
  }, [apiRoute, batchId, fail, load, locale, setPhase])

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
        setRefusal(
          refusalMessage(trashed.body, 'This batch could not be discarded.', trashed.status),
        )
        return
      }
      setPhase('discarded')
    } catch {
      fail(UNREACHABLE_REFUSAL)
    } finally {
      running.current = false
    }
  }, [apiRoute, batchId, fail, locale, setPhase])

  if (phase === 'discarded') {
    return (
      <Banner type="info">
        Batch discarded — nothing in the Atlas changed. An admin can restore it within 7 days if you
        discarded it by mistake.
      </Banner>
    )
  }

  if (phase === 'committed' && outcome) return <OutcomeReport outcome={outcome} />

  const committing = answer?.status === 'committing' || progress !== null
  // The tree and the choices freeze once a commit has begun (`endpoints/tree.ts`).
  const locked = phase === 'committing' || phase === 'editing' || committing
  const working = phase === 'committing' || phase === 'editing' || phase === 'loading'
  const stateLayer = answer ? stateLayerNote(answer.proposedRegions) : null
  const invitable = answer ? invitableCount(answer.coordinators) : 0

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
      {phase === 'failed' && !answer ? (
        <div className="region-import__review-actions">
          <Button onClick={() => void load().catch(() => fail(UNREACHABLE_REFUSAL))}>
            Try again
          </Button>
          <Button buttonStyle="secondary" onClick={() => void discard()}>
            Discard this batch
          </Button>
        </div>
      ) : null}
      {progress?.warning ? <Banner type="info">{progress.warning}</Banner> : null}
      {phase === 'committing' ? (
        <p>{progress ? commitProgressNote(progress) : 'Creating the regions…'}</p>
      ) : null}

      {answer ? (
        <>
          <p>{treeNote(answer)}</p>
          <p>{coordinatorNote(answer.coordinators)}</p>
          {invitable ? (
            <label className="region-import__invite">
              <input
                checked={answer.inviteCoordinators}
                disabled={locked}
                onChange={(event) => choose({ inviteCoordinators: event.target.checked })}
                type="checkbox"
              />
              {` Email ${invitable === 1 ? 'this coordinator' : `these ${invitable} coordinators`} an invitation to sign in once their classes are created`}
            </label>
          ) : null}
          {stateLayer ? <p>{stateLayer}</p> : null}

          <h3>Regions</h3>
          <TreeLevel
            busy={locked}
            mappable={answer.mappable}
            nodes={childrenByParent(answer.proposedRegions.nodes)}
            onEdit={applyEdit}
            parentKey={null}
          />

          <h3>Lines</h3>
          <RowTable
            busy={locked}
            onChoose={(line, action) => choose({ duplicates: [{ line, action }] })}
            rows={answer.rows}
            setShowAll={setShowAll}
            showAll={showAll}
          />

          <div className="region-import__review-actions">
            <Button disabled={working} onClick={() => void commit()}>
              {committing ? 'Resume creating the classes' : 'Create the classes'}
            </Button>
            {committing ? null : (
              <Button buttonStyle="secondary" disabled={working} onClick={() => void discard()}>
                Discard this batch
              </Button>
            )}
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
 * One proposed region, with the edits it accepts where it accepts them.
 *
 * ⚠ **Picking a region and mapping onto it are two steps.** Arrow keys on a
 * focused `<select>` fire `change` in Chrome on Windows and Linux, so a select
 * that sent the edit itself mapped a city onto the first candidate as a reviewer
 * tabbed through the tree. Choosing only fills the control, the button sends it,
 * and a node the reviewer mapped can be taken back.
 *
 * ⚠ **The mapping control is a native `<select>`, not `SelectInput`.** That
 * wrapper is a react-select widget, and this is one control per node inside a
 * nested list rather than a field in a form.
 */
const TreeNode = ({ busy, mappable, node, onEdit }: TreeNodeProps) => {
  const [draft, setDraft] = useState(node.name)
  const [target, setTarget] = useState('')
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

      {isUnmappableNode(node) ? (
        <Button
          buttonStyle="secondary"
          disabled={busy}
          onClick={() => onEdit({ kind: 'unmap', key: node.key })}
        >
          Create it instead
        </Button>
      ) : null}

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
              {`Or use a region already in the Atlas for ${node.name}`}
              <select
                disabled={busy}
                onChange={(event) => setTarget(event.target.value)}
                value={target}
              >
                <option value="">Choose a region…</option>
                {candidates.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
              <Button
                buttonStyle="secondary"
                disabled={busy || !target}
                onClick={() => {
                  const regionId = Number(target)
                  if (regionId) onEdit({ kind: 'map', key: node.key, regionId })
                }}
              >
                Use it
              </Button>
            </label>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

interface RowTableProps {
  readonly rows: readonly ReviewRow[]
  readonly busy: boolean
  readonly showAll: boolean
  readonly setShowAll: (showAll: boolean) => void
  readonly onChoose: (line: number, action: ReviewDuplicate['action']) => void
}

/**
 * The lines of the file and what the commit will do with each.
 *
 * ⚠ **The lines that need a decision come first, and alone until asked for.** In
 * a 500-line batch, finding the twelve skipped among every line is otherwise the
 * reviewer's whole job.
 *
 * Payload's own `Table` rather than markup of ours, so this reads as a list view
 * (`docs/rules/admin-ui.md`).
 */
const RowTable = ({ busy, onChoose, rows, setShowAll, showAll }: RowTableProps) => {
  const { config } = useConfig()
  const eventUrl = (id: number) =>
    formatAdminURL({ adminRoute: config.routes.admin, path: `/collections/events/${id}` })
  if (!rows.length) return <p>This batch holds no lines.</p>

  const flagged = rows.filter(needsAttention)
  const shown = showAll || !flagged.length ? rows : flagged

  return (
    <>
      <p>
        {flagged.length
          ? `${flagged.length} of ${rows.length} lines need a look.`
          : `All ${rows.length} lines are ready.`}{' '}
        {flagged.length && flagged.length < rows.length ? (
          <Button buttonStyle="secondary" onClick={() => setShowAll(!showAll)} size="small">
            {showAll ? 'Show only those' : `Show all ${rows.length}`}
          </Button>
        ) : null}
      </p>
      <Table
        appearance="condensed"
        columns={[
          tableColumn(
            'line',
            'Line',
            shown.map((row) => row.line),
          ),
          tableColumn(
            'title',
            'Title',
            shown.map((row) => row.title ?? '—'),
          ),
          tableColumn(
            'place',
            'Place',
            shown.map((row) => row.place ?? '—'),
          ),
          tableColumn(
            'status',
            'Status',
            shown.map((row) => ROW_STATUS_LABEL[row.status]),
          ),
          tableColumn(
            'duplicate',
            'Duplicate',
            shown.map((row) =>
              row.duplicate ? (
                <DuplicateChoice
                  key={row.line}
                  busy={busy || row.status === 'committed'}
                  duplicate={row.duplicate}
                  eventUrl={
                    row.duplicate.eventId === undefined ? null : eventUrl(row.duplicate.eventId)
                  }
                  onChoose={(action) => onChoose(row.line, action)}
                />
              ) : (
                '—'
              ),
            ),
          ),
          tableColumn(
            'coordinator',
            'Coordinator',
            shown.map((row) => COORDINATOR_LABEL[row.coordinator]),
          ),
          tableColumn(
            'reasons',
            'Notes',
            shown.map((row) => [...row.reasons, ...row.warnings].join('; ') || '—'),
          ),
        ]}
        data={shown.map((row) => ({ id: row.line }))}
      />
    </>
  )
}

/** What a reviewer decides about one duplicate. Skipping is the default. */
const DuplicateChoice = ({
  busy,
  duplicate,
  eventUrl,
  onChoose,
}: {
  readonly busy: boolean
  readonly duplicate: ReviewDuplicate
  readonly eventUrl: null | string
  readonly onChoose: (action: ReviewDuplicate['action']) => void
}) => {
  const actions = (Object.keys(DUPLICATE_ACTION_LABEL) as ReviewDuplicate['action'][]).filter(
    (action) => action !== 'overwrite' || duplicate.overwritable,
  )
  return (
    <span>
      {duplicateNote(duplicate)}
      {eventUrl ? (
        <>
          {' '}
          <a href={eventUrl} rel="noreferrer" target="_blank">
            open it
          </a>
        </>
      ) : null}
      <select
        aria-label="What to do with this duplicate"
        disabled={busy}
        onChange={(event) => onChoose(event.target.value as ReviewDuplicate['action'])}
        value={duplicate.action}
      >
        {actions.map((action) => (
          <option key={action} value={action}>
            {DUPLICATE_ACTION_LABEL[action]}
          </option>
        ))}
      </select>
    </span>
  )
}

/**
 * What the import came to.
 *
 * ⚠ **This never reloads itself.** The batch is reduced to its report by the
 * call that answered, so this is what the volunteer keeps on screen — the same
 * report is emailed to them, and the skipped lines can be downloaded to fix and
 * upload again.
 */
const OutcomeReport = ({ outcome }: { readonly outcome: FinishedChunk }) => {
  const { finished } = outcome
  const download = () => {
    const blob = new Blob([skippedRowsCsv(finished.skipped)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'skipped-lines.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="region-import__outcome">
      <Banner type="success">{commitDoneNote(outcome)}</Banner>
      {finished.reportEmailed ? (
        <p>
          This report has been emailed to you
          {finished.skipped.length ? ', with the skipped lines attached' : ''}.
        </p>
      ) : (
        <Banner type="info">
          The report could not be emailed to you, so keep this page open until you have what you
          need from it.
        </Banner>
      )}
      {finished.skipped.length ? (
        <>
          <h3>Lines skipped</h3>
          <Button buttonStyle="secondary" onClick={download}>
            Download the skipped lines (CSV) to fix and upload again
          </Button>
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
  'The import could not be reached. Check your connection, then try again — the batch keeps what it has done.'

const MISSING_REPORT_REFUSAL =
  'The commit finished but reported nothing. Check the classes on the region before running it again.'
