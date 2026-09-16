/**
 * The Live Preview panel opens by itself on a `proposal` row, and on no other
 * intake.
 *
 * `admin.openByDefault` is the option that would say this. It is collection-wide
 * and takes no function, so on a table holding four intakes it would greet a
 * contact, subscribe or registration row with the `not-reviewable` page. The
 * branch therefore lives on a field, and this pins the two halves that make that
 * work: the condition is true for exactly one type, and the declaration carries
 * `autoOpen` alone.
 *
 * **Why `autoOpen` alone matters.** `composeTargetUrl` returns `null` — leave
 * the panel where it is — only while the target names neither a `path` nor
 * `params`. Adding either here would repoint a URL that `livePreview.url`
 * already resolves per type, and the two would then disagree about where a
 * proposal previews.
 */
import type { Field, Operation, UIField } from 'payload'

import { describe, expect, it } from 'vitest'

import { SUBMISSION_TYPES, userSubmissionFields } from '@/collections/UserSubmissions/fields'
import type { PreviewTarget } from '@/fields/previewTargetField'

const previewTargetOf = (field: Field): PreviewTarget | undefined =>
  field.type === 'ui' && field.admin?.components?.Field === '@/components/admin/PreviewTarget'
    ? (field.admin.custom as { previewTarget?: PreviewTarget } | undefined)?.previewTarget
    : undefined

/** The third argument, which this condition ignores but the signature requires. */
const conditionArgs = (operation: Operation) => ({
  blockData: {},
  operation,
  path: [],
  user: null,
})

/** `defaultFields` is the plugin's own contribution; none of it is under test. */
const fields = userSubmissionFields({ defaultFields: [] })

const targets = fields.filter((field) => previewTargetOf(field) !== undefined) as UIField[]

describe('the proposal live-preview target', () => {
  // Without this, every case below would pass over an empty list if the field
  // were dropped or renamed.
  it('is declared exactly once', () => {
    expect(targets).toHaveLength(1)
  })

  it('opens the panel and repoints nothing', () => {
    const target = previewTargetOf(targets[0]!)!

    expect(target.autoOpen).toBe(true)
    expect(target.path).toBeUndefined()
    expect(target.params).toBeUndefined()
  })

  it.each(SUBMISSION_TYPES.map((type) => [type] as const))(
    'mounts for %s only when that is the reviewable type',
    (type) => {
      const condition = targets[0]!.admin?.condition
      expect(condition).toBeTypeOf('function')

      expect(condition!({ type }, {}, conditionArgs('update'))).toBe(type === 'proposal')
    },
  )

  it('does not mount before a type is known', () => {
    const condition = targets[0]!.admin!.condition!

    expect(condition({}, {}, conditionArgs('create'))).toBe(false)
    expect(condition({ type: undefined }, {}, conditionArgs('create'))).toBe(false)
  })
})
