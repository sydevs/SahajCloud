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

import type { Field } from 'payload'

import { flattenTopLevelFields } from 'payload/shared'
import { describe, expect, it } from 'vitest'

import { TextBoxBlock } from '@/lib/richEditor/blocks/TextBoxBlock'

type Condition = NonNullable<NonNullable<Field['admin']>['condition']>

// Hoists the children of `row`, which holds no data of its own, so they are
// siblings here as they are to Payload. It drops UI fields, but types the
// result as though it kept them, so the narrowing is what makes `name` a string.
const FIELDS = flattenTopLevelFields(TextBoxBlock.fields).filter(
  (field): field is typeof field & { name: string } => 'name' in field,
)

function conditionFor(name: string): Condition {
  const field = FIELDS.find((f) => f.name === name)
  expect(field, `${name} is not a field of TextBoxBlock`).toBeDefined()

  const condition = field!.admin?.condition
  expect(condition, `${name} has no admin.condition`).toBeTypeOf('function')

  return condition!
}

/** The three arguments Payload passes; only `siblingData` is read here. */
function shows(condition: Condition, siblingData: Record<string, unknown>): boolean {
  return condition({}, siblingData, {
    blockData: {},
    operation: 'update',
    path: ['blocks', 0, 'wisdomStyle'],
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

// Scoped to this block on purpose. The match reads the plain `siblingData?.x`
// spelling, which all five of these use; `LayoutBlock` casts (`(siblingData as
// {…})?.style`) and reads `blockData`, neither of which this would see.
describe('TextBoxBlock conditions read declared fields', () => {
  const declared = new Set(FIELDS.map((f) => f.name))

  it.each(FIELDS.filter((f) => f.admin?.condition).map((f) => f.name))(
    '%s reads only sibling fields the block declares',
    (name) => {
      const source = conditionFor(name).toString()
      const read = [...source.matchAll(/siblingData\??\.(\w+)/g)].map((m) => m[1])

      expect(read.length).toBeGreaterThan(0)
      expect(read.filter((field) => !declared.has(field))).toEqual([])
    },
  )
})
