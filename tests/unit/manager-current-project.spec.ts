import type { SelectField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Managers } from '@/collections/Managers/Managers'
import { getProjectSlugs } from '@/plugins/access'

/**
 * Pins the removal of the `''` sentinel from `currentProject` — see #671 for
 * the option, the self-cancelling hook and the sidebar bug behind it.
 *
 * No fixture stands in for the config here. The spec reads the real
 * `src/collections/Managers/Managers.ts` export, so a re-added option or hook
 * fails it.
 */

const currentProject = Managers.fields.find(
  (field): field is SelectField => field.type === 'select' && field.name === 'currentProject',
)
if (!currentProject) throw new Error('Managers declares no `currentProject` select field')

describe('Managers.currentProject', () => {
  it('offers exactly the real project slugs, and no sentinel', () => {
    // `options` is `(string | OptionObject)[]`, so normalize rather than cast —
    // a bare-string option would otherwise read back as `undefined`.
    const values = currentProject.options?.map((option) =>
      typeof option === 'string' ? option : option.value,
    )

    expect(values).toEqual(getProjectSlugs())
    expect(values).not.toContain('')
  })

  it('carries no hook that rewrites the stored value', () => {
    // The `''` → `null` beforeChange existed only to undo the option above.
    expect(currentProject.hooks?.beforeChange ?? []).toHaveLength(0)
  })

  it('stays hidden, which is why no option ever had to name the admin view', () => {
    expect(currentProject.admin?.hidden).toBe(true)
  })
})
