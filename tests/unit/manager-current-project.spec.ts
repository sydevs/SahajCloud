import type { Field, SelectField } from 'payload'

import { describe, expect, it } from 'vitest'

import { Managers } from '@/collections/Managers/Managers'
import { getProjectSlugs } from '@/plugins/access'

/**
 * `Managers.currentProject` once carried an `''` option meaning the admin "All
 * Content" view, plus a `beforeChange` hook that mapped `''` straight back to
 * `null`. The pair was self-cancelling, and it widened the generated
 * `Manager['currentProject']` union with a member no consumer handled.
 *
 * `visibility.ts` is what made that latent rather than harmless. It reads
 * `user.currentProject ?? null`, and `??` does not catch `''`, so a row holding
 * the sentinel reached `isCollectionVisibleInProject` as a project name, matched
 * no collection, and hid every project-assigned collection in the sidebar.
 * `null` would have shown them all.
 *
 * No fixture stands in for the config here — the spec reads the real
 * `src/collections/Managers/Managers.ts` export, so a re-added option or hook
 * fails it. See #671.
 */

const currentProject = (Managers.fields as Field[]).find(
  (field): field is SelectField => 'name' in field && field.name === 'currentProject',
)

describe('Managers.currentProject', () => {
  it('is a select field on the collection', () => {
    expect(currentProject).toBeDefined()
  })

  it('offers exactly the real project slugs, and no sentinel', () => {
    const values = (currentProject!.options as { value: string }[]).map((o) => o.value)

    expect(values).toEqual(getProjectSlugs())
    expect(values).not.toContain('')
  })

  it('carries no hook that rewrites the stored value', () => {
    // The `''` → `null` beforeChange existed only to undo the option above.
    expect(currentProject!.hooks?.beforeChange ?? []).toHaveLength(0)
  })

  it('stays hidden, which is why no option ever had to name the admin view', () => {
    expect(currentProject!.admin?.hidden).toBe(true)
  })
})
