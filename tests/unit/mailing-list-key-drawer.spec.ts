/**
 * @vitest-environment jsdom
 *
 * `MailingListKey`'s drawer — what the operator is told when a save does not
 * store the key (#1109).
 *
 * It needs a DOM because the behaviour is the component's own error state:
 * `save()` chooses between the provider's words and a fallback, and the choice
 * is only observable in what the drawer renders afterwards.
 *
 * The stand-in reproduces the three `@payloadcms/ui` behaviours the component
 * relies on: `useFormFields` selects over the form's fields, `Drawer` mounts
 * its children whatever the modal's state (`docs/rules/admin-ui.md`), and
 * `TextInput` reports a change through `onChange`.
 */
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** The mailing-list values the form holds for the render under test. */
let fields: Record<string, { value: unknown }> = {}

// `vi.mock`'s factory is hoisted above every declaration in this file, so the
// spies it closes over have to be hoisted with it.
const ui = vi.hoisted(() => ({ closeModal: vi.fn(), success: vi.fn() }))

vi.mock('@payloadcms/ui', () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
  }) => createElement('button', { disabled, onClick, type: 'button' }, children),
  Drawer: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  FieldLabel: ({ label }: { label: string }) => createElement('label', null, label),
  TextInput: ({
    onChange,
    value,
  }: {
    onChange: (event: { target: { value: string } }) => void
    value: string
  }) => createElement('input', { onChange, value }),
  toast: { success: ui.success },
  useConfig: () => ({ config: { routes: { api: '/api' }, serverURL: 'https://cms.test' } }),
  useDocumentInfo: () => ({ id: 42 }),
  useFormFields: (selector: (args: [Record<string, { value: unknown }>]) => unknown) =>
    selector([fields]),
  useModal: () => ({ closeModal: ui.closeModal, openModal: vi.fn() }),
}))

// `vi.mock` is hoisted above this import, so the component sees the stand-in.
import { MailingListKey } from '@/components/admin/MailingListKey/MailingListKey'

const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')

const REFUSAL = 'Mailing list: that API key was refused.'
const FALLBACK = 'The key could not be saved.'

describe('MailingListKey drawer', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    fields = {
      'mailingList.listId': { value: '12' },
      'mailingList.provider': { value: 'brevo' },
    }
    ui.closeModal.mockClear()
    ui.success.mockClear()

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  const button = (label: string) =>
    [...container.querySelectorAll('button')].find((node) => node.textContent === label)

  const saveKey = async (typed: string) => {
    await act(async () => {
      root.render(createElement(MailingListKey, { last4: null, style: {} }))
    })

    const input = container.querySelector('input')
    if (!input) throw new Error('no key input rendered')
    await act(async () => {
      // React installs its own `value` setter on the node and compares against
      // what that setter last saw, so a plain assignment makes the dispatched
      // event look like no change at all. The prototype's setter is the way
      // past that.
      nativeValue?.set?.call(input, typed)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      button('Save key')?.click()
    })
  }

  it('quotes the provider when the endpoint refuses the key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ errors: [{ message: REFUSAL }] }),
        ok: false,
      }),
    )

    await saveKey('wrong-key')

    expect(container.textContent).toContain(REFUSAL)
    expect(ui.closeModal).not.toHaveBeenCalled()
    expect(ui.success).not.toHaveBeenCalled()
  })

  it('speaks when the request never reached the endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await saveKey('a-real-key')

    expect(container.textContent).toContain(FALLBACK)
    expect(button('Save key')?.disabled).toBe(false)
    expect(ui.closeModal).not.toHaveBeenCalled()
    expect(ui.success).not.toHaveBeenCalled()
  })
})
