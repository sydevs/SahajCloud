/**
 * @vitest-environment jsdom
 *
 * What a custom field's markup owes, on the two fields #1221 fixed. Both put
 * `field-<path>` on the wrapper `<div>` and left the `<input>` without it, so
 * `FieldLabel`'s `htmlFor` resolved to a non-control — the click focused
 * nothing, and a screen reader announced the input unnamed. Their inline styles
 * also overrode the only focus affordance `formInput` gives an input.
 *
 * It needs a DOM because the subject is a resolution against the whole rendered
 * page rather than one element's props: `label.control` is the browser's own
 * `htmlFor` resolution, and it answers `null` for a non-control, which is the
 * defect exactly.
 *
 * The stand-in reproduces one `@payloadcms/ui` behaviour, read from
 * `dist/fields/FieldLabel/index.js` and `dist/utilities/generateFieldID.js`:
 * `FieldLabel` renders `<label htmlFor={generateFieldID(path, editDepth, uuid)}>`,
 * which on a document form is `field-<path>` — `editDepth` is 1 there, and the
 * form `uuid` only the drawers pass. Both components also double each `.` to
 * `__`, as Payload does; no collection nests either field today, so the paths
 * below are flat and that substitution is exercised by nothing here.
 */
import type { ComponentType } from 'react'

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@payloadcms/ui', () => ({
  FieldDescription: () => null,
  FieldError: () => null,
  FieldLabel: ({ label, path }: { label?: string; path: string }) =>
    createElement('label', { htmlFor: `field-${path.replace(/\./g, '__')}` }, label),
  useField: () => ({ setValue: vi.fn(), showError: false }),
}))

// `vi.mock` is hoisted above these, so each component sees the stand-in.
import ColorField from '@/components/admin/ColorField/ColorField'
import TimestampInput from '@/components/admin/TimestampInput'

/** Each field under one of its real paths — `clients.color1`, `lectures.startTime`. */
const FIELDS: { Field: ComponentType<never>; name: string }[] = [
  { Field: ColorField as ComponentType<never>, name: 'color1' },
  { Field: TimestampInput as ComponentType<never>, name: 'startTime' },
]

describe.each(FIELDS)('$name', ({ Field, name }) => {
  let container: HTMLDivElement
  let root: Root

  const input = () => container.querySelector('input') as HTMLInputElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(Field, { field: { name, label: 'A label' } } as never))
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    document.body.innerHTML = ''
  })

  it('gives the label a control to resolve to', () => {
    const label = container.querySelector('label') as HTMLLabelElement
    expect(label.control).toBe(input())
  })

  it('leaves that id on nothing but the input', () => {
    const carriers = [...container.querySelectorAll(`[id="field-${name}"]`)]
    expect(carriers.map((el) => el.tagName)).toEqual(['INPUT'])
  })

  it('overrides neither half of the focus affordance formInput gives the input', () => {
    // The mixin answers focus with a border-colour change under `outline: 0`,
    // so an inline border defeats the one and an inline outline the other.
    expect([input().style.border, input().style.outline]).toEqual(['', ''])
  })

  it('merges the field styles onto its root, so a declared width reaches Payload', () => {
    // `merge-field-styles.spec.ts` owns what the helper returns. This is only
    // that the root goes through it at all, so it reads the property, not a value.
    expect((container.firstElementChild as HTMLElement).style.flex).not.toBe('')
  })
})
