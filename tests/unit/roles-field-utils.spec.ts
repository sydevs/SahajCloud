import { describe, expect, it } from 'vitest'

import { derivedRolesNote, roleChips, storedRoles } from '@/components/admin/RolesField/utils'

const labelOf = (role: string) => role.toUpperCase()

describe('roleChips', () => {
  it('puts the derived roles before the stored ones', () => {
    // Backspace removes the last chip; a derived one there would block every stored role.
    expect(
      roleChips({ derived: ['atlas-region-manager'], labelOf, stored: ['web-translator'] }),
    ).toEqual([
      { derived: true, label: 'ATLAS-REGION-MANAGER', value: 'atlas-region-manager' },
      { derived: false, label: 'WEB-TRANSLATOR', value: 'web-translator' },
    ])
  })

  it('shows derived chips for a manager with no stored roles', () => {
    expect(roleChips({ derived: ['atlas-event-manager'], labelOf, stored: [] })).toHaveLength(1)
  })
})

describe('storedRoles', () => {
  const regionChip = { derived: true, label: 'Region', value: 'atlas-region-manager' }
  const translatorChip = { derived: false, label: 'Translator', value: 'web-translator' }

  it('drops a derived chip from the stored value', () => {
    expect(storedRoles([regionChip, translatorChip])).toEqual(['web-translator'])
  })

  it('keeps a stored role removed by Backspace removed, and nothing derived comes back', () => {
    // pop-value: react-select hands over the selection minus the last chip.
    expect(storedRoles([regionChip])).toEqual([])
  })

  it('treats a newly picked option, which carries no flag, as stored', () => {
    const pickedOption = { label: 'Path', value: 'path-editor' }
    expect(storedRoles([regionChip, pickedOption])).toEqual(['path-editor'])
  })

  it('answers an empty value for a clear or a null selection', () => {
    expect(storedRoles([])).toEqual([])
    expect(storedRoles(null)).toEqual([])
  })
})

describe('derivedRolesNote', () => {
  it('says nothing when no role is derived', () => {
    expect(derivedRolesNote([])).toBeNull()
  })

  it('names one role in the singular', () => {
    expect(derivedRolesNote(['Atlas Region Manager'])).toMatch(
      /^Atlas Region Manager is derived .* so it applies in every locale/,
    )
  })

  it('names two roles in the plural', () => {
    expect(derivedRolesNote(['Atlas Region Manager', 'Atlas Event Manager'])).toMatch(
      /^Atlas Region Manager and Atlas Event Manager are derived .* so they apply/,
    )
  })
})
