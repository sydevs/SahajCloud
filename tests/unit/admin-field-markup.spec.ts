/**
 * @vitest-environment jsdom
 *
 * What a custom field's markup owes, on the two fields #1221 fixed. Each rule
 * is in `docs/rules/admin-ui.md` § Custom field components, and each was broken
 * here: the id sat on the wrapper `<div>`, so `FieldLabel`'s `htmlFor` resolved
 * to a non-control — the click focused nothing and a screen reader announced
 * the input unnamed — and the inline styles overrode the only focus affordance
 * Payload's `formInput` gives an input.
 *
 * It needs a DOM because two of the four subjects are resolutions against the
 * whole rendered page rather than one element's props: which element an
 * `htmlFor` reaches, and which elements carry an id. `label.control` is the
 * browser's own answer, and it is `null` for a non-control, which is the defect
 * exactly.
 *
 * The stand-in reproduces one `@payloadcms/ui` behaviour, read from
 * `dist/fields/FieldLabel/index.js` and `dist/utilities/generateFieldID.js`:
 * `FieldLabel` renders `<label htmlFor={generateFieldID(path, editDepth, uuid)}>`,
 * which on a document form is `field-<path>` — `editDepth` is 1 there, and the
 * form `uuid` only the document drawers pass.
 */
import type { TextFieldClient } from 'payload'
import type { ComponentType } from 'react'

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What the stubbed `useField` answers. */
const state = { value: undefined as unknown }

vi.mock('@payloadcms/ui', () => ({
  FieldDescription: () => null,
  FieldError: () => null,
  FieldLabel: ({ label, path }: { label?: string; path: string }) =>
    createElement('label', { htmlFor: `field-${path.replace(/\./g, '__')}` }, label),
  useField: () => ({ setValue: vi.fn(), showError: false, value: state.value }),
}))

// `vi.mock` is hoisted above these, so each component sees the stand-in.
import ColorField from '@/components/admin/ColorField/ColorField'
import TimestampInput from '@/components/admin/TimestampInput'

const FIELDS: [string, ComponentType<never>, string, unknown][] = [
  ['ColorField', ColorField as ComponentType<never>, 'brandColor', '#1d9e6c'],
  ['TimestampInput', TimestampInput as ComponentType<never>, 'startTime', 90],
]

describe.each(FIELDS)('%s', (_name, Field, path, value) => {
  let container: HTMLDivElement
  let root: Root

  const input = () => container.querySelector('input') as HTMLInputElement

  beforeEach(() => {
    state.value = value
    container = document.createElement('div')
    document.body.replaceChildren(container)
    root = createRoot(container)
    const field = { name: path, label: 'Start time', type: 'text' } as TextFieldClient
    act(() => {
      root.render(createElement(Field, { field } as never))
    })
  })

  it('gives the label a control to resolve to', () => {
    const label = container.querySelector('label') as HTMLLabelElement
    expect(label.htmlFor).toBe(`field-${path}`)
    expect(label.control).toBe(input())
  })

  it('leaves that id on nothing but the input', () => {
    const carriers = [...container.querySelectorAll(`[id="field-${path}"]`)]
    expect(carriers.map((el) => el.tagName)).toEqual(['INPUT'])
  })

  it('overrides neither half of the focus affordance formInput gives the input', () => {
    // `formInput` answers focus with a border-colour change under `outline: 0`,
    // so an inline border defeats the one and an inline outline the other.
    expect([input().style.border, input().style.outline]).toEqual(['', ''])
  })

  it('flexes to fill its slot in a row, as a built-in field does', () => {
    expect((container.firstElementChild as HTMLElement).style.flex).toBe('1 1 auto')
  })
})
