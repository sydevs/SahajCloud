/**
 * The Live Preview panel opens by itself on a `proposal` row, and closes by
 * itself on every other intake.
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
const opener = targets.find((field) => previewTargetOf(field)?.autoOpen)
const closer = targets.find((field) => previewTargetOf(field)?.autoClose)

describe('the submission live-preview targets', () => {
  // Without this, every case below would pass over an empty list if a field
  // were dropped or renamed.
  it('declares one opener and one closer', () => {
    expect(targets).toHaveLength(2)
    expect(opener).toBeDefined()
    expect(closer).toBeDefined()
  })

  it.each([
    ['opener', () => opener],
    ['closer', () => closer],
  ] as const)('the %s repoints nothing', (_, get) => {
    const target = previewTargetOf(get()!)!

    expect(target.path).toBeUndefined()
    expect(target.params).toBeUndefined()
    expect(Boolean(target.autoOpen) && Boolean(target.autoClose)).toBe(false)
  })

  it.each(SUBMISSION_TYPES.map((type) => [type] as const))(
    'on %s, exactly one of the two mounts, and the opener only for a proposal',
    (type) => {
      const opens = opener!.admin!.condition!({ type }, {}, conditionArgs('update'))
      const closes = closer!.admin!.condition!({ type }, {}, conditionArgs('update'))

      expect(opens).toBe(type === 'proposal')
      expect(closes).toBe(type !== 'proposal')
    },
  )

  it('mounts neither before a type is known', () => {
    for (const target of [opener!, closer!]) {
      const condition = target.admin!.condition!
      expect(condition({}, {}, conditionArgs('create'))).toBe(false)
      expect(condition({ type: undefined }, {}, conditionArgs('create'))).toBe(false)
    }
  })
})
