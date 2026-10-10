/**
 * @vitest-environment jsdom
 *
 * `WorkflowActions` — the document-control buttons every staged collection
 * declares as data (#907).
 *
 * It needs a DOM for the half that is wiring rather than logic: which hook feeds
 * the stage, what reaches `submit`, and whether a button is disabled. The stage
 * rule itself is pure and asserted directly, with no mount.
 *
 * The stand-in reproduces four `@payloadcms/ui` behaviours, read from
 * `node_modules/@payloadcms/ui/dist/`: `useDocumentInfo().id` is absent on a
 * create (`providers/DocumentInfo`), `useFormFields` selects over form state,
 * `useFormModified` is false until the form is touched, and `FormSubmit` renders
 * a `<button>` that is disabled when its `disabled` prop is true
 * (`forms/Submit/index.js` — it also disables on `processing`, which is Payload's
 * own concern and not this component's).
 */
import type { ReactNode } from 'react'

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What the stubbed providers answer for the render under test. */
const form: {
  fields: Record<string, { value: unknown }>
  modified: boolean
  operation: 'create' | 'update'
  uploadStatus: 'failed' | 'idle' | 'uploading'
} = { fields: {}, modified: false, operation: 'create', uploadStatus: 'idle' }

const submit = vi.fn()

vi.mock('@payloadcms/ui', () => ({
  FormSubmit: ({
    children,
    disabled,
    onClick,
  }: {
    children?: ReactNode
    disabled?: boolean
    onClick?: () => void
  }) => createElement('button', { disabled: Boolean(disabled), onClick, type: 'button' }, children),
  PublishButton: () => createElement('button', { type: 'button' }, 'Payload publish'),
  SaveButton: () => createElement('button', { type: 'button' }, 'Payload save'),
  SaveDraftButton: () => createElement('button', { type: 'button' }, 'Payload save draft'),
  useDocumentInfo: () => ({ uploadStatus: form.uploadStatus }),
  useForm: () => ({ submit }),
  useFormFields: (selector: (args: [Record<string, { value: unknown }>]) => unknown) =>
    selector([form.fields]),
  useFormModified: () => form.modified,
  useOperation: () => form.operation,
}))

// `vi.mock` is hoisted above these imports, so the component sees the stand-in.
import {
  CREATE_STAGE,
  resolveStage,
  type WorkflowActionsProps,
} from '@/components/admin/buttons/WorkflowActions/stages'
import WorkflowActions from '@/components/admin/buttons/WorkflowActions/WorkflowActions'

/** `event-imports`' own declaration, trimmed to the stages each case needs. */
const imports: WorkflowActionsProps = {
  statusField: 'status',
  fallback: null,
  stages: {
    [CREATE_STAGE]: [{ label: 'Upload & resolve addresses', overrides: {} }],
    resolving: [
      { label: 'Discard', overrides: { status: 'discarded' }, confirm: 'Discard anyway?' },
    ],
    review: [
      { label: 'Save changes', overrides: {} },
      { label: 'Commit', overrides: { status: 'committing' }, confirm: 'Create these classes?' },
    ],
  },
}

/** Meditations' own declaration: no status field, one stage, a fallback. */
const meditations: WorkflowActionsProps = {
  fallback: 'saveDraft',
  stages: {
    [CREATE_STAGE]: [
      { label: 'Next step', overrides: { _status: 'draft' }, skipValidation: true },
    ],
  },
}

describe('resolveStage', () => {
  it('names the create stage for an unsaved document whatever the status holds', () => {
    expect(resolveStage({ operation: 'create', status: 'resolving', statusField: 'status' })).toBe(
      CREATE_STAGE,
    )
  })

  it('reads the status field on a saved document', () => {
    expect(resolveStage({ operation: 'update', status: 'review', statusField: 'status' })).toBe(
      'review',
    )
  })

  /**
   * Each of these names no stage, which is not a stage with no buttons: the
   * caller renders its fallback for the first and nothing for the second. A
   * saved document with no `statusField` is how Meditations reaches Payload's
   * own buttons on every screen but the create.
   */
  it('names no stage when no status field is declared, or it holds no string', () => {
    expect(resolveStage({ operation: 'update', status: 'review', statusField: undefined }))
      .toBeUndefined()
    expect(resolveStage({ operation: 'update', status: undefined, statusField: 'status' }))
      .toBeUndefined()
    expect(resolveStage({ operation: 'update', status: 3, statusField: 'status' })).toBeUndefined()
  })

  /** An absent provider must not read as a saved document's stage. */
  it('names the create stage when the operation is unknown', () => {
    expect(resolveStage({ operation: undefined, status: 'review', statusField: 'status' })).toBe(
      CREATE_STAGE,
    )
  })
})

describe('WorkflowActions', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    form.fields = {}
    form.modified = false
    form.operation = 'create'
    form.uploadStatus = 'idle'
    submit.mockReset()
    vi.restoreAllMocks()

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  const render = (props: WorkflowActionsProps) => {
    act(() => {
      root.render(createElement(WorkflowActions, props))
    })
  }

  const buttons = () => Array.from(container.querySelectorAll('button'))
  const click = (label: string) => {
    const button = buttons().find((b) => b.textContent === label)
    if (!button) throw new Error(`No button labelled "${label}" — rendered: ${labels().join(', ')}`)
    act(() => {
      button.click()
    })
  }
  const labels = () => buttons().map((b) => b.textContent)

  it('offers the create stage on an unsaved document holding a later status', () => {
    form.fields = { status: { value: 'resolving' } }

    render(imports)

    expect(labels()).toEqual(['Upload & resolve addresses'])
  })

  it('offers the stage the status field names on a saved document', () => {
    form.operation = 'update'
    form.fields = { status: { value: 'review' } }

    render(imports)

    expect(labels()).toEqual(['Save changes', 'Commit'])
  })

  it('renders the fallback for a stage the declaration does not name', () => {
    form.operation = 'update'

    render(meditations)

    expect(labels()).toEqual(['Payload save draft'])
  })

  /**
   * The distinction the `stages` map rests on. Meditations declares an empty
   * create stage for its Publish slot — a stage with no action — and falling
   * through to the fallback there would put Publish back on the create screen,
   * which is the behaviour the slot exists to remove.
   *
   * ⚠ **The markup, not just the buttons.** An empty actions array used to
   * render the flex wrapper with no children, which is a stray gap in
   * `.doc-controls__controls` rather than the nothing the old create-screen
   * Publish slot rendered — invisible to a count of buttons.
   */
  it('renders nothing at all for a stage declared with no actions', () => {
    form.operation = 'update'
    form.fields = { status: { value: 'committing' } }

    render({ ...imports, fallback: 'save', stages: { ...imports.stages, committing: [] } })

    expect(labels()).toEqual([])
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing for an unnamed stage when the fallback is null', () => {
    form.operation = 'update'
    form.fields = { status: { value: 'finished' } }

    render(imports)

    expect(labels()).toEqual([])
  })

  it('submits the action’s overrides and skipValidation', () => {
    render(meditations)

    click('Next step')

    expect(submit).toHaveBeenCalledWith({
      overrides: { _status: 'draft' },
      skipValidation: true,
    })
  })

  it('asks before an action carrying a confirmation, and submits once accepted', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    form.operation = 'update'
    form.fields = { status: { value: 'review' } }

    render(imports)
    click('Commit')

    expect(confirm).toHaveBeenCalledWith('Create these classes?')
    expect(submit).toHaveBeenCalledWith({
      overrides: { status: 'committing' },
      skipValidation: undefined,
    })
  })

  it('submits nothing when the confirmation is dismissed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    form.operation = 'update'
    form.fields = { status: { value: 'review' } }

    render(imports)
    click('Commit')

    expect(submit).not.toHaveBeenCalled()
  })

  /**
   * Payload's own `SaveButton` disables itself on an unmodified update, and an
   * action with no overrides is that button — it posts only what the form holds.
   */
  it('disables an action with no overrides while a saved document is unmodified', () => {
    form.operation = 'update'
    form.fields = { status: { value: 'review' } }

    render(imports)

    expect(buttons().map((b) => [b.textContent, b.disabled])).toEqual([
      ['Save changes', true],
      ['Commit', false],
    ])
  })

  it('enables an action with no overrides once the form is modified', () => {
    form.operation = 'update'
    form.modified = true
    form.fields = { status: { value: 'review' } }

    render(imports)

    expect(buttons().map((b) => b.disabled)).toEqual([false, false])
  })

  /** Nothing is saved yet, so there is no unmodified state to guard against. */
  it('enables an action with no overrides on a create', () => {
    form.fields = { status: { value: 'resolving' } }

    render(imports)

    expect(buttons().map((b) => b.disabled)).toEqual([false])
  })

  /**
   * The rule every Payload document-control button applies, and the one that
   * matters most here: `event-imports`' document IS its file, so a save posted
   * mid-upload posts the batch without the CSV.
   */
  it('disables every action while a file is still uploading', () => {
    form.operation = 'update'
    form.modified = true
    form.uploadStatus = 'uploading'
    form.fields = { status: { value: 'review' } }

    render(imports)

    expect(buttons().map((b) => b.disabled)).toEqual([true, true])
  })
})
