/**
 * @vitest-environment jsdom
 *
 * The review surface's wiring: which requests it sends, in which order, and what
 * it refuses to do (#828, phase 7c-iii-b).
 *
 * `reviewModel.ts`'s decisions are each pinned pure in
 * `event-import-review-model.spec.ts`. This file exists because that is not
 * enough — `docs/testing.md`'s #132: a helper can be spec'd exhaustively and
 * never destructured by its caller, leaving an arm that cannot occur in
 * production while every assertion about it stays green. `commitVerdict`'s stall
 * arm and the missing-report guard are both that shape, so they are asserted
 * through the loop that has to honour them.
 *
 * The `@payloadcms/ui` stand-in reproduces only what the component reads. The
 * real module pulls stylesheets no node runner can load, which is why
 * `importGate` was extracted from `ImportView` for the same reason.
 */

import type { ReactNode } from 'react'

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  COMMIT_STALLED_REFUSAL,
  DISCARD_CONFIRM,
} from '@/components/admin/RegionImport/reviewModel'

const ui = vi.hoisted(() => ({ locale: 'de' as string | undefined }))

vi.mock('@payloadcms/ui', () => ({
  Banner: ({ children }: { children: ReactNode }) =>
    createElement('div', { role: 'status' }, children),
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode
    disabled?: boolean
    onClick: () => void
  }) => createElement('button', { disabled, onClick }, children),
  // Enough of Payload's list-view `Table` to assert what reached a cell: one
  // heading per column, and its pre-rendered nodes in row order.
  Table: ({ columns }: { columns: { Heading: ReactNode; renderedCells: ReactNode[] }[] }) =>
    createElement(
      'table',
      null,
      createElement(
        'tbody',
        null,
        ...columns.map((column, index) =>
          createElement('tr', { key: index }, ...column.renderedCells.map(asCell)),
        ),
      ),
    ),
  // The rename box: an input carrying the label, which is how a spec tells one
  // node's control from another's.
  TextInput: ({
    label,
    onChange,
    readOnly,
    value,
  }: {
    label: string
    onChange: (event: { target: { value: string } }) => void
    readOnly?: boolean
    value: string
  }) =>
    createElement(
      'label',
      null,
      label,
      createElement('input', { disabled: readOnly, onChange, value }),
    ),
  useConfig: () => ({ config: { routes: { admin: '/admin' } } }),
  useLocale: () => ({ code: ui.locale }),
}))

const asCell = (cell: ReactNode, index: number) => createElement('td', { key: index }, cell)

const { ImportReview } = await import('@/components/admin/RegionImport/ImportReview')

interface Call {
  body: unknown
  method: string
  url: string
}

let answers: { body: unknown; ok: boolean; status?: number }[]
let calls: Call[]
let confirms: string[]
let confirmed: boolean

beforeEach(() => {
  answers = []
  calls = []
  confirms = []
  confirmed = true
  ui.locale = 'de'
  vi.stubGlobal('confirm', (message: string) => {
    confirms.push(message)
    return confirmed
  })
  vi.stubGlobal('fetch', (url: string, init: { body?: string; method: string }) => {
    calls.push({
      body: init.body ? JSON.parse(init.body) : undefined,
      method: init.method,
      url,
    })
    const answer = answers.shift()
    if (!answer) throw new Error(`Unscripted request: ${url}`)
    return Promise.resolve({
      json: () => Promise.resolve(answer.body),
      ok: answer.ok,
      status: answer.status ?? (answer.ok ? 200 : 422),
    })
  })
})

const state = {
  key: 'state:DE-BE',
  level: 'region',
  lines: [2, 3],
  location: null,
  match: { kind: 'create' },
  name: 'Berlin',
  parentKey: null,
  slug: 'berlin',
}

const city = {
  key: 'city:id:place.mitte',
  level: 'city',
  lines: [2],
  location: null,
  match: { kind: 'create' },
  name: 'Mitte',
  parentKey: 'state:DE-BE',
  slug: 'mitte',
}

const review = (over: Record<string, unknown> = {}) => ({
  coordinators: { created: 2, existing: 1, unlinked: 0 },
  inviteCoordinators: false,
  creating: 2,
  existing: 0,
  mappable: [
    { id: 7, level: 'city', name: 'Berlin-Mitte' },
    { id: 8, level: 'region', name: 'Brandenburg' },
  ],
  proposedRegions: {
    nodes: [state, city],
    rowErrors: [],
    stateLayer: { proposed: true, states: [], unplacedCityKeys: [] },
  },
  rowErrors: 0,
  rows: [
    {
      coordinator: 'new',
      duplicate: null,
      line: 2,
      place: 'Berlin',
      reasons: [],
      status: 'ready',
      title: 'Morning class',
      warnings: [],
    },
    {
      coordinator: 'existing',
      duplicate: { action: 'skip', eventId: 77, overwritable: true, strength: 'strong' },
      line: 3,
      place: 'Potsdam',
      reasons: ['a repeat of class #77'],
      status: 'duplicate',
      title: 'Evening class',
      warnings: [],
    },
  ],
  status: 'resolved',
  target: { id: 11, level: 'country', name: 'Germany' },
  ...over,
})

const commitChunk = (over: Record<string, unknown> = {}) => ({
  committedNow: 1,
  coordinators: { created: 1, matched: 0, refused: 0 },
  done: false,
  pending: 1,
  regions: { adopted: 0, created: 2, failed: 0 },
  rows: { committed: 1, duplicates: 1, errors: 0, total: 3, unverified: 0, verified: 1 },
  ...over,
})

const finishedChunk = {
  ...commitChunk({ committedNow: 1, done: true, pending: 0 }),
  finished: {
    committed: [
      { action: 'created', eventId: 21, line: 2 },
      { action: 'created', eventId: 22, line: 4 },
    ],
    reportEmailed: true,
    skipped: [{ line: 3, reasons: ['a repeat of class #77'], values: { title: 'Evening class' } }],
    summaryEmailed: true,
  },
}

async function mount(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(ImportReview, { apiRoute: '/api', batchId: 5 }))
  })
  return { container, root }
}

function buttonFor(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes(label),
  )
  if (!button) throw new Error(`No button reading ${label}`)
  return button as HTMLButtonElement
}

/**
 * The mapping control that actually offers this region.
 *
 * One select per editable node, each filtered to its own level — so taking the
 * first one and setting a city's id on the state's control leaves the value
 * unselected and sends nothing, which is the component behaving correctly.
 */
function selectOffering(container: HTMLElement, regionId: string): HTMLSelectElement {
  const select = [...container.querySelectorAll('select')].find((candidate) =>
    [...candidate.querySelectorAll('option')].some((option) => option.value === regionId),
  )
  if (!select) throw new Error(`No mapping control offers region ${regionId}`)
  return select as HTMLSelectElement
}

/**
 * Map a node onto a region the way a reviewer does: pick it, then press the
 * button beside that control. Picking alone sends nothing.
 */
async function mapOnto(container: HTMLElement, regionId: string) {
  const select = selectOffering(container, regionId)
  await setValue(select, regionId)
  const button = select.parentElement?.querySelector('button')
  await act(async () => {
    button?.click()
  })
}

/** The rename box of the node carrying this name. */
function renameInput(container: HTMLElement, name: string): HTMLInputElement {
  const label = [...container.querySelectorAll('label')].find((candidate) =>
    candidate.textContent?.startsWith(`Rename ${name}`),
  )
  const input = label?.querySelector('input')
  if (!input) throw new Error(`No rename box for ${name}`)
  return input
}

async function click(container: HTMLElement, label: string) {
  const button = buttonFor(container, label)
  await act(async () => {
    button.click()
  })
}

/** The urls the surface asked for, which is what every ordering assertion reads. */
const urls = () => calls.map((call) => call.url)

/**
 * Type into a control the way a person does.
 *
 * ⚠ **Through the prototype's own setter, not the property.** React tracks each
 * input's last value on the node, and assigning `.value` updates that tracker
 * too — so the change event it then hears looks like a no-op and is swallowed.
 * An earlier version of this file did exactly that, and every edit assertion
 * passed while the component had been sent nothing.
 */
async function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype =
    element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
  await act(async () => {
    element.dispatchEvent(new Event('change', { bubbles: true }))
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('ImportReview', () => {
  it('reads the batch once on mount and renders what it answered', async () => {
    answers = [{ body: review(), ok: true }]
    const { container } = await mount()

    expect(urls()).toEqual(['/api/event-imports/5/review?locale=de'])
    expect(calls[0]!.method).toBe('GET')
    expect(container.textContent).toContain('2 new regions.')
    expect(container.textContent).toContain('2 new coordinator accounts will be opened')
    // Both nodes, and the line that needs a decision.
    expect(container.textContent).toContain('Berlin')
    expect(container.textContent).toContain('Mitte')
    expect(container.textContent).toContain('Duplicate — skipped')
    expect(container.textContent).toContain('Duplicate of class #77')
    // ⚠ A ready line waits behind "show all", so the twelve that need a look in
    // a 500-line batch are not buried among the rest.
    expect(container.textContent).not.toContain('Morning class')
    await click(container, 'Show all 2')
    expect(container.textContent).toContain('Morning class')
  })

  // #701: a request naming no locale resolves to the default one server-side, so
  // the manager who holds the grant elsewhere gets a 403 saying nothing.
  it('sends nothing at all when the page cannot say which locale it is in', async () => {
    ui.locale = undefined
    const { container } = await mount()

    expect(calls).toEqual([])
    expect(container.textContent).toContain('could not tell which language')
  })

  it('offers a mapping only onto the regions at the node’s own level', async () => {
    answers = [{ body: review(), ok: true }]
    const { container } = await mount()

    const options = [...container.querySelectorAll('select')].flatMap((select) =>
      [...select.querySelectorAll('option')].map((option) => option.textContent),
    )
    // `Brandenburg` is a state in the subtree, so it is offered to the state node
    // and never to the city — a city mapped onto it is a 422 the control invited.
    expect(options.filter((label) => label === 'Berlin-Mitte')).toHaveLength(1)
    expect(options.filter((label) => label === 'Brandenburg')).toHaveLength(1)
  })

  // The stored tree is the one the commit walks, and an edit re-slugs across it
  // and can prune a state that just emptied — so the surface re-reads rather than
  // patching what it holds.
  it('sends one edit as a delta, then re-reads the review', async () => {
    answers = [
      { body: review(), ok: true },
      {
        body: { creating: 1, existing: 1, proposedRegions: {}, pruned: [], rowErrors: 0 },
        ok: true,
      },
      { body: review({ creating: 1, existing: 1 }), ok: true },
    ]
    const { container } = await mount()

    // Choosing fills the control and sends nothing; the button sends it.
    await setValue(selectOffering(container, '7'), '7')
    expect(urls()).toHaveLength(1)
    await mapOnto(container, '7')

    expect(urls()).toEqual([
      '/api/event-imports/5/review?locale=de',
      '/api/event-imports/5/tree?locale=de',
      '/api/event-imports/5/review?locale=de',
    ])
    expect(calls[1]!.body).toEqual({
      edits: [{ key: 'city:id:place.mitte', kind: 'map', regionId: 7 }],
    })
    expect(container.textContent).toContain('1 new region, 1 already in the Atlas.')
  })

  it('renames a node with the name trimmed, and nothing else', async () => {
    answers = [
      { body: review(), ok: true },
      {
        body: { creating: 2, existing: 0, proposedRegions: {}, pruned: [], rowErrors: 0 },
        ok: true,
      },
      { body: review(), ok: true },
    ]
    const { container } = await mount()

    await setValue(renameInput(container, 'Berlin'), '  Berlin Mitte  ')
    await click(container, 'Rename')

    expect(calls[1]!.body).toEqual({
      edits: [{ key: 'state:DE-BE', kind: 'rename', name: 'Berlin Mitte' }],
    })
  })

  // All or nothing: the stored tree is untouched by a refused edit, so re-reading
  // would only fetch back what is already on screen.
  it('keeps the tree on screen when an edit is refused, and re-reads nothing', async () => {
    answers = [
      { body: review(), ok: true },
      { body: { errors: [{ message: 'No node answers to that key.' }] }, ok: false },
    ]
    const { container } = await mount()

    await mapOnto(container, '7')

    expect(urls()).toEqual([
      '/api/event-imports/5/review?locale=de',
      '/api/event-imports/5/tree?locale=de',
    ])
    expect(container.textContent).toContain('No node answers to that key.')
    expect(container.textContent).toContain('Mitte')
  })

  it('commits chunk after chunk, then reports what the batch did', async () => {
    answers = [
      { body: review(), ok: true },
      { body: commitChunk({ pending: 2 }), ok: true },
      { body: commitChunk({ pending: 1 }), ok: true },
      { body: finishedChunk, ok: true },
    ]
    const { container } = await mount()
    await click(container, 'Create the classes')

    expect(urls()).toEqual([
      '/api/event-imports/5/review?locale=de',
      '/api/event-imports/5/commit?locale=de',
      '/api/event-imports/5/commit?locale=de',
      '/api/event-imports/5/commit?locale=de',
    ])
    expect(container.textContent).toContain('2 classes created')
    // The report is what the volunteer keeps: emailed to them, and the skipped
    // lines downloadable to fix and upload again.
    expect(container.textContent).toContain('Line 3 — a repeat of class #77')
    expect(container.textContent).toContain('emailed to you')
    expect(buttonFor(container, 'Download the skipped lines')).toBeTruthy()
  })

  // ⚠ A doubled commit is two chunk loops writing the same rows. `disabled` is
  // derived from state that has not been applied when a second click lands in the
  // same tick, so the bound has to be a ref.
  it('runs one commit for two clicks in the same tick', async () => {
    answers = [
      { body: review(), ok: true },
      { body: finishedChunk, ok: true },
    ]
    const { container } = await mount()
    const button = buttonFor(container, 'Create the classes')
    await act(async () => {
      button.click()
      button.click()
    })

    expect(urls()).toEqual([
      '/api/event-imports/5/review?locale=de',
      '/api/event-imports/5/commit?locale=de',
    ])
  })

  // The #132 shape. `commitVerdict` answers `stalled`, and nothing proves the
  // loop reads that answer except a loop that would otherwise not end.
  it('stops committing once a chunk settles nothing, instead of looping forever', async () => {
    answers = [
      { body: review(), ok: true },
      { body: commitChunk({ pending: 2 }), ok: true },
      { body: commitChunk({ pending: 2 }), ok: true },
      { body: review({ status: 'committing' }), ok: true },
    ]
    const { container } = await mount()
    await click(container, 'Create the classes')

    // The two chunks, then one read of the batch, never a third chunk.
    expect(urls().filter((url) => url.includes('/commit'))).toHaveLength(2)
    expect(container.textContent).toContain(COMMIT_STALLED_REFUSAL)
  })

  // `finished` rides only on the call that ends the commit. Reading `done` alone
  // would show a success carrying no account of what was created.
  it('refuses a finished commit that reported nothing', async () => {
    answers = [
      { body: review(), ok: true },
      { body: commitChunk({ done: true, pending: 0 }), ok: true },
    ]
    const { container } = await mount()
    await click(container, 'Create the classes')

    expect(container.textContent).toContain('reported nothing')
    expect(container.textContent).not.toContain('classes created')
  })

  /**
   * ⚠ **Resume stays enabled on a committing batch, and Discard is gone.** A
   * batch reopened from the Import tab part-way through its commit can only go
   * forward — the server refuses to discard it — and a disabled Resume left it
   * with no way to finish at all.
   */
  it('resumes an interrupted commit rather than offering to start one', async () => {
    answers = [{ body: review({ status: 'committing' }), ok: true }]
    const { container } = await mount()

    expect(buttonFor(container, 'Resume creating the classes').disabled).toBe(false)
    expect(container.textContent).not.toContain('Discard this batch')
  })

  // The batch is read back after a failed chunk, so the surface shows it as the
  // server holds it: committing, frozen, and not discardable.
  it('offers a resume after a chunk failed, and no discard', async () => {
    answers = [
      { body: review(), ok: true },
      { body: commitChunk({ pending: 2 }), ok: true },
      { body: { errors: [{ message: 'The database went away.' }] }, ok: false, status: 503 },
      { body: review({ status: 'committing' }), ok: true },
    ]
    const { container } = await mount()
    await click(container, 'Create the classes')

    expect(container.textContent).toContain('The database went away.')
    expect(buttonFor(container, 'Resume creating the classes').disabled).toBe(false)
    expect(container.textContent).not.toContain('Discard this batch')
  })

  it('advises waiting, not retrying, when a gateway timed the request out', async () => {
    answers = [
      { body: review(), ok: true },
      { body: null, ok: false, status: 504 },
      { body: review({ status: 'committing' }), ok: true },
    ]
    const { container } = await mount()
    await click(container, 'Create the classes')

    expect(container.textContent).toContain('It may still be working')
  })

  // ⚠ `POST /:id/tree` 409s a committing batch outright, so a control offered on
  // one is a refusal the surface invited.
  it('lets no tree edit be made on a batch whose commit is half-written', async () => {
    answers = [{ body: review({ status: 'committing' }), ok: true }]
    const { container } = await mount()

    const controls = [...container.querySelectorAll('select, input')]
    expect(controls.length).toBeGreaterThan(0)
    expect(controls.every((control) => (control as HTMLSelectElement).disabled)).toBe(true)
    expect(buttonFor(container, 'Rename').disabled).toBe(true)
  })

  // ⚠ The reloaded tree simply no longer holds a pruned node, so the edit's own
  // answer is the only moment the surface can name what went.
  it('says which proposed regions an edit emptied out of the tree', async () => {
    answers = [
      { body: review(), ok: true },
      { body: { creating: 1, pruned: ['state:DE-BE'] }, ok: true },
      { body: review({ creating: 1 }), ok: true },
    ]
    const { container } = await mount()
    await mapOnto(container, '7')

    expect(container.textContent).toContain('1 proposed region held nothing after that change')
  })

  // ⚠ The report is on screen, and a re-read would replace it with whatever the
  // finished batch answers next.
  it('never re-reads the batch once the commit has finished', async () => {
    answers = [
      { body: review(), ok: true },
      { body: finishedChunk, ok: true },
    ]
    const { container, root } = await mount()
    await click(container, 'Create the classes')
    expect(container.textContent).toContain('2 classes created')

    // What an admin locale switch does: `load`'s identity changes and the mount
    // effect would fire again.
    ui.locale = 'en'
    await act(async () => {
      root.render(createElement(ImportReview, { apiRoute: '/api', batchId: 5 }))
    })

    expect(urls()).toHaveLength(2)
    expect(container.textContent).toContain('2 classes created')
  })

  it('says so when the report could not be emailed', async () => {
    answers = [
      { body: review(), ok: true },
      {
        body: { ...finishedChunk, finished: { ...finishedChunk.finished, reportEmailed: false } },
        ok: true,
      },
    ]
    const { container } = await mount()
    await click(container, 'Create the classes')

    expect(container.textContent).toContain('could not be emailed to you')
  })

  /** Skip is the default; the reviewer's choice is sent, then the batch read back. */
  it('sends a duplicate decision, then re-reads the review', async () => {
    answers = [
      { body: review(), ok: true },
      { body: { ok: true }, ok: true },
      { body: review(), ok: true },
    ]
    const { container } = await mount()
    const choice = container.querySelector('select[aria-label="What to do with this duplicate"]')
    expect([...choice!.querySelectorAll('option')].map((option) => option.value)).toEqual([
      'skip',
      'import',
      'overwrite',
    ])
    await setValue(choice as HTMLSelectElement, 'overwrite')

    expect(urls()[1]).toBe('/api/event-imports/5/choices?locale=de')
    expect(calls[1]!.body).toEqual({ duplicates: [{ action: 'overwrite', line: 3 }] })
    expect(urls()).toHaveLength(3)
  })

  /** An import emails nobody unless the reviewer opts in, per batch. */
  it('sends the invitation opt-in, off until ticked', async () => {
    answers = [
      { body: review(), ok: true },
      { body: { ok: true }, ok: true },
      { body: review({ inviteCoordinators: true }), ok: true },
    ]
    const { container } = await mount()
    const optIn = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(optIn.checked).toBe(false)
    expect(container.textContent).toContain('Email these 3 coordinators an invitation')
    await act(async () => {
      optIn.click()
    })

    expect(calls[1]!.body).toEqual({ inviteCoordinators: true })
  })

  it('offers to take back a mapping the reviewer made, and only that', async () => {
    const mapped = {
      ...city,
      before: { location: null, name: 'Mitte', parentKey: 'state:DE-BE' },
      match: { kind: 'existing', name: 'Berlin-Mitte', regionId: 7, slug: 'berlin-mitte' },
      parentKey: null,
      slug: null,
    }
    answers = [
      {
        body: review({
          proposedRegions: { ...review().proposedRegions, nodes: [state, mapped] },
        }),
        ok: true,
      },
      { body: { pruned: [] }, ok: true },
      { body: review(), ok: true },
    ]
    const { container } = await mount()
    await click(container, 'Create it instead')

    expect(calls[1]!.body).toEqual({ edits: [{ key: 'city:id:place.mitte', kind: 'unmap' }] })
  })

  it('asks before discarding, and sends nothing when the answer is no', async () => {
    answers = [{ body: review(), ok: true }]
    confirmed = false
    const { container } = await mount()
    await click(container, 'Discard this batch')

    expect(confirms).toEqual([DISCARD_CONFIRM])
    expect(urls()).toEqual(['/api/event-imports/5/review?locale=de'])
  })

  // ⚠ A discard is an update, not a delete: `payload.delete` is the hard delete
  // on this collection and stays with the admins and the purge job, so the
  // seven-day window survives a volunteer changing their mind.
  it('discards by writing deletedAt, never by deleting the batch', async () => {
    answers = [
      { body: review(), ok: true },
      { body: { id: 5 }, ok: true },
    ]
    const { container } = await mount()
    await click(container, 'Discard this batch')

    expect(calls[1]!.method).toBe('PATCH')
    expect(calls[1]!.url).toBe('/api/event-imports/5?locale=de')
    expect(Object.keys(calls[1]!.body as object)).toEqual(['deletedAt'])
    expect(container.textContent).toContain('nothing in the Atlas changed')
  })

  it('ends a dropped connection somewhere the reviewer can act on', async () => {
    answers = [{ body: review(), ok: true }]
    const { container } = await mount()
    await act(async () => {
      vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    })
    await click(container, 'Create the classes')

    expect(container.textContent).toContain('could not be reached')
  })
})
