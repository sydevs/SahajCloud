/**
 * The two readers that turn a subdivision's spelling into the code
 * `getRegionOptions` lists — one for a Mapbox answer, one for typed text.
 *
 * Both have to land on the dataset's code, because that is what an address
 * `region` select stores and what an import target is confined by, and Mapbox
 * does not always use it.
 */
import { describe, expect, it } from 'vitest'

import { resolveSubdivisionCode, subdivisionCodeFor } from '@/lib/geography'

describe('subdivisionCodeFor', () => {
  it('reads a code or a name, in any case', () => {
    expect(subdivisionCodeFor('DE', 'BY')).toBe('BY')
    expect(subdivisionCodeFor('de', 'bayern')).toBe('BY')
  })

  it('does not throw for a country whose subdivisions carry no code', () => {
    // Building PR's index read `.toLowerCase()` off a missing code, so every
    // endpoint with a target there threw.
    expect(subdivisionCodeFor('PR', 'San Juan')).toBeNull()
    expect(subdivisionCodeFor('FO', 'Streymoy')).toBeNull()
    expect(subdivisionCodeFor('KZ', 'Bayqongyr')).toBeNull()
    expect(subdivisionCodeFor('KZ', 'Almaty')).toBe('ALA')
  })

  it('declines a country the table does not hold', () => {
    expect(subdivisionCodeFor('ZZ', 'Bayern')).toBeNull()
    expect(subdivisionCodeFor(null, 'Bayern')).toBeNull()
  })

  it("maps Mapbox's code onto the dataset's where the two schemes differ", () => {
    // Spain's communities against the dataset's provinces, and India's renames.
    expect(subdivisionCodeFor('ES', 'MD')).toBe('M')
    expect(subdivisionCodeFor('ES', 'AS')).toBe('O')
    expect(subdivisionCodeFor('ES', 'CB')).toBe('S')
    expect(subdivisionCodeFor('ES', 'RI')).toBe('LO')
    expect(subdivisionCodeFor('ES', 'IB')).toBe('PM')
    expect(subdivisionCodeFor('IN', 'CG')).toBe('CT')
    expect(subdivisionCodeFor('IN', 'UK')).toBe('UT')
    expect(subdivisionCodeFor('IN', 'OD')).toBe('OR')
  })

  it('keeps an alias inside its own country', () => {
    // `MD` is Madrid only in Spain; in the US it is Maryland.
    expect(subdivisionCodeFor('US', 'MD')).toBe('MD')
    // Catalonia is four provinces, so it has no one code to map to.
    expect(subdivisionCodeFor('ES', 'CT')).toBeNull()
  })

  it('reads a code the dataset lists with its country prefix', () => {
    expect(subdivisionCodeFor('DK', '84')).toBe('DK-84')
    expect(subdivisionCodeFor('FI', 'FI-01')).toBe('FI-01')
  })

  it('matches a name that carries words the listed one drops', () => {
    expect(subdivisionCodeFor('ES', 'Comunidad de Madrid')).toBe('M')
    expect(subdivisionCodeFor('ES', 'Principado de Asturias')).toBe('O')
    expect(subdivisionCodeFor('ES', 'Comunidad Foral de Navarra')).toBe('NA')
    expect(subdivisionCodeFor('FR', 'Ile de France')).toBe('IDF')
  })

  it('does not match a name that only shares a word', () => {
    expect(subdivisionCodeFor('US', 'West Virginia')).toBe('WV')
    expect(subdivisionCodeFor('US', 'Virginia')).toBe('VA')
    expect(subdivisionCodeFor('DE', 'Bavaria')).toBeNull()
  })
})

describe('resolveSubdivisionCode', () => {
  it("returns the dataset's code for a Mapbox code in another scheme", () => {
    expect(resolveSubdivisionCode({ region_code: 'MD', name: 'Community of Madrid' }, 'ES')).toBe(
      'M',
    )
    expect(resolveSubdivisionCode({ region_code_full: 'IN-UK' }, 'IN')).toBe('UT')
  })

  it('falls back to the name when the code is not one the dataset lists', () => {
    expect(resolveSubdivisionCode({ region_code: '11', name: 'Île-de-France' }, 'FR')).toBe('IDF')
  })

  it("keeps Mapbox's own code where nothing in the dataset answers", () => {
    // GB lists councils, never England, so the code is all there is to keep.
    expect(resolveSubdivisionCode({ region_code: 'ENG', name: 'England' }, 'GB')).toBe('ENG')
    expect(resolveSubdivisionCode({ region_code: 'CA' }, null)).toBe('CA')
  })
})
