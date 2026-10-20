/**
 * `TextBoxBlock`'s `admin.condition` functions.
 *
 * A condition that names a field the block does not declare is always false,
 * so the field it guards never renders — and nothing fails. `wisdomStyle` read
 * the legacy EditorJS `position` for its whole life, which survives only inside
 * `importData`, so the "Ancient Wisdom" checkbox was unreachable in `/admin`
 * and the WeMeditate importer was its only writer (#989).
 *
 * The closed-list case at the end is the general form of that defect.
 */

import type { Condition } from 'payload'

import { flattenTopLevelFields } from 'payload/shared'
import { describe, expect, it } from 'vitest'

import { TextBoxBlock } from '@/lib/richEditor/blocks/TextBoxBlock'

// Hoists the children of `row`, which holds no data of its own, so they are
// siblings here as they are to Payload. It drops UI fields, but types the
// result as though it kept them, so the narrowing is what makes `name` a string.
const FIELDS = flattenTopLevelFields(TextBoxBlock.fields).filter(
  (field): field is typeof field & { name: string } => 'name' in field,
)

function conditionFor(name: string): Condition {
  const condition = FIELDS.find((f) => f.name === name)?.admin?.condition
  if (!condition) throw new Error(`TextBoxBlock has no ${name} field with an admin.condition`)

  return condition
}

/** The three arguments Payload passes; only `siblingData` is read here. */
function shows(condition: Condition, siblingData: Record<string, unknown>): boolean {
  return condition({}, siblingData, {
    blockData: {},
    operation: 'update',
    path: [],
    user: null,
  })
}

describe('TextBoxBlock wisdomStyle condition', () => {
  const condition = conditionFor('wisdomStyle')

  it.each(['left', 'right'])('shows the checkbox for imagePosition %s', (imagePosition) => {
    expect(shows(condition, { imagePosition })).toBe(true)
  })

  it('hides the checkbox for imagePosition overlay', () => {
    expect(shows(condition, { imagePosition: 'overlay' })).toBe(false)
  })

  // `imagePosition` is required and defaults to `left`, so there is no absent
  // state to guard. A presence guard would hide the checkbox on a block whose
  // radio the editor has not touched yet.
  it('shows the checkbox before imagePosition is set', () => {
    expect(shows(condition, {})).toBe(true)
  })
})

/** Dotted and bracketed reads alike — a typo in either spelling is the defect. */
function siblingReads(condition: Condition): string[] {
  const source = condition.toString()
  const matches = source.matchAll(/siblingData(?:\?\.|\.)(\w+)|siblingData\??\[['"]([^'"]+)['"]\]/g)

  return [...matches].map(([, dotted, bracketed]) => dotted ?? bracketed)
}

describe('TextBoxBlock conditions read declared fields', () => {
  const declared = new Set(FIELDS.map((f) => f.name))

  const conditions = FIELDS.flatMap((field) =>
    field.admin?.condition ? [[field.name, field.admin.condition] as const] : [],
  )

  // Pinned rather than counted per case, so a condition rewritten into a
  // spelling `siblingReads` cannot see fails here instead of passing with
  // nothing to check. A future condition reading `data` or `blockData` — the
  // spelling `LayoutBlock` uses — belongs in this map as `[]`.
  it('reads exactly these sibling fields', () => {
    expect(Object.fromEntries(conditions.map(([name, c]) => [name, siblingReads(c)]))).toEqual({
      textPosition: ['imagePosition'],
      textColor: ['imagePosition'],
      wisdomStyle: ['imagePosition'],
      subtitle: ['title'],
      buttonUrl: ['buttonText'],
    })
  })

  it.each(conditions)('%s reads only sibling fields the block declares', (_name, condition) => {
    expect(siblingReads(condition).filter((field) => !declared.has(field))).toEqual([])
  })
})
