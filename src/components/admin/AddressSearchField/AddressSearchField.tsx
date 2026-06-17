'use client'

import type { TextFieldClientComponent } from 'payload'

import {
  Banner,
  FieldDescription,
  FieldError,
  FieldLabel,
  ReactSelect,
  type ReactSelectOption,
  useField,
  useForm,
} from '@payloadcms/ui'
import dynamic from 'next/dynamic'
import React, { useEffect, useState } from 'react'

import { getRegionOptions } from '@/lib/geography'

/** Subset of a Mapbox Search Box retrieve feature that we read. */
interface MapboxRetrieveFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: {
    mapbox_id?: string
    name?: string
    address?: string
    full_address?: string
    context?: {
      address?: { name?: string }
      place?: { name?: string }
      region?: { region_code?: string; region_code_full?: string; name?: string }
      postcode?: { name?: string }
      country?: { country_code?: string; name?: string }
    }
  }
}

interface MapboxRetrieveResponse {
  features?: MapboxRetrieveFeature[]
}

interface MapboxTheme {
  variables?: Record<string, string>
}

interface MapboxSearchBoxProps {
  accessToken: string
  onRetrieve?: (res: MapboxRetrieveResponse) => void
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  options?: { language?: string; types?: string; country?: string }
  theme?: MapboxTheme
}

/**
 * `@mapbox/search-js-react` registers a custom element on import (it touches
 * `window`/`customElements`), so load it client-side only via `next/dynamic`.
 */
const SearchBox = dynamic(async () => (await import('@mapbox/search-js-react')).SearchBox, {
  ssr: false,
}) as unknown as React.ComponentType<MapboxSearchBoxProps>

/** Replace the last segment of a dotted path (e.g. `address.mapboxId` → `address.street`). */
function toSiblingPath(path: string, siblingName: string): string {
  const parts = path.split('.')
  parts[parts.length - 1] = siblingName
  return parts.join('.')
}

/**
 * Resolve the address subdivision to a code our region dropdown understands.
 * Mapbox usually returns a bare ISO 3166-2 code (`region_code`, e.g. `CA`), but
 * not for every result — so fall back to the country-prefixed
 * `region_code_full` (`US-CA` → `CA`), then to matching the region name against
 * our country-region-data options. This populates `region` whenever Mapbox
 * gives us anything to match on.
 */
function resolveRegionCode(
  region: { region_code?: string; region_code_full?: string; name?: string } | undefined,
  countryCode: string | undefined,
): string | undefined {
  if (!region) return undefined
  if (region.region_code) return region.region_code
  if (region.region_code_full?.includes('-')) return region.region_code_full.split('-').pop()
  if (region.name && countryCode) {
    const name = region.name.toLowerCase()
    const match = getRegionOptions(countryCode).find(
      (option) => option.label.toLowerCase() === name,
    )
    if (match) return match.value
  }
  return undefined
}

/**
 * Resolve a Payload theme CSS variable to a concrete `rgb()` color. Mapbox
 * *parses* its theme colors (to derive hover/active shades), so a raw
 * `var(--theme-…)` reference fails and falls back to its default dark text —
 * invisible on Payload's dark theme. Painting the var onto a throwaway element
 * and reading back the computed `color` yields a concrete value Mapbox accepts.
 */
function resolveColor(cssVar: string, fallback: string): string {
  const probe = document.createElement('span')
  probe.style.cssText = `color: var(${cssVar}, ${fallback}); position: absolute; visibility: hidden; pointer-events: none;`
  document.body.appendChild(probe)
  const color = getComputedStyle(probe).color || fallback
  probe.remove()
  return color
}

/** Mapbox theme built from Payload's resolved colors, refreshed on light/dark toggle. */
function usePayloadSearchTheme(): MapboxTheme | undefined {
  const [theme, setTheme] = useState<MapboxTheme | undefined>(undefined)
  useEffect(() => {
    const read = () =>
      setTheme({
        variables: {
          fontFamily: getComputedStyle(document.body).fontFamily || 'inherit',
          colorText: resolveColor('--theme-elevation-800', '#202020'),
          colorBackground: resolveColor('--theme-input-bg', '#ffffff'),
          colorBackgroundHover: resolveColor('--theme-elevation-100', '#f0f0f0'),
          colorPrimary: resolveColor('--theme-elevation-1000', '#000000'),
          colorSecondary: resolveColor('--theme-elevation-400', '#9a9a9a'),
          borderRadius: '4px',
        },
      })
    read()
    // Payload toggles `data-theme` on <html>; re-read so the search box follows.
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => observer.disconnect()
  }, [])
  return theme
}

/** Sentinel stored in `mapboxId` when the user opts to enter the address by hand. */
const MANUAL = 'manual'

/**
 * Mapbox Search Box field component, bound to a `mapboxId` text field — used by
 * the Event address (`addressFields`) and the Regions location. Selecting a
 * result stores the Mapbox feature id (this field's value). Two `admin.custom`
 * options tune it:
 *  - `searchTypes` — the Mapbox `types` filter (default `address,poi`).
 *  - `searchTypesField` + `searchTypesByValue` — scope `types` to a sibling
 *    field's value (Regions narrow the search by `level`); read reactively, with
 *    `searchTypes` as the fallback.
 *  - `populateAddress` — when set, also fills the sibling address fields
 *    (street/city/region/country/postCode/lat/long) from the result. Off for
 *    id-only use (Regions store just the id).
 *  - `populateName` — when set, fills the sibling `name` field from the result
 *    (used by Regions to name a node after the place picked).
 *
 * All sibling writes are skip-if-already-populated, so a selection never
 * clobbers values already entered.
 *
 * Dependent fields reveal off this field's value (the address siblings in
 * `addressFields`; the manual-coordinates row in Regions), so writing it via
 * `useField().setValue` is what reveals them. "Enter manually" stores the
 * `manual` sentinel — also the fallback when no `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
 * is configured.
 */
export const AddressSearchField: TextFieldClientComponent = ({ field, path, readOnly }) => {
  const { label, localized, required, admin } = field
  const description = admin?.description
  // `searchTypes`: Mapbox Search Box `types` filter (default address+POI).
  // `populateAddress`: fill sibling address fields on retrieve (default off —
  // Regions use this in id-only mode, where there are no address siblings).
  // `populateName`: fill the sibling `name` field from the result (Regions).
  const config = (admin?.custom ?? {}) as {
    searchTypes?: string
    populateAddress?: boolean
    populateName?: boolean
    searchTypesField?: string
    searchTypesByValue?: Record<string, string>
    placeholder?: string
    allowManual?: boolean
    allowManualByValue?: Record<string, boolean>
  }

  const { value, setValue, showError } = useField<string>({ path })
  const { dispatchFields, getDataByPath } = useForm()
  const theme = usePayloadSearchTheme()
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

  // Controlled search-box text. The box stays mounted (just hidden) while a
  // value is selected, so clearing the pill returns to it without a remount
  // flicker; resetting this empties the input on clear.
  const [query, setQuery] = useState('')

  // Scope the Mapbox `types` filter to a sibling field's value when configured
  // (Regions narrow the search by `level`); read it reactively via useField so
  // the search re-scopes live as that field changes. Falls back to a static
  // `searchTypes`, then to address+POI. (Functions can't be passed through
  // `admin.custom` — it's serialized to the client — so the mapping is data.)
  const scopePath = config.searchTypesField ? toSiblingPath(path, config.searchTypesField) : path
  const { value: scopeValue } = useField<string>({ path: scopePath })
  const searchTypes =
    (config.searchTypesField ? config.searchTypesByValue?.[scopeValue ?? ''] : undefined) ??
    config.searchTypes ??
    'address,poi'

  // Whether "Enter manually" is offered, resolved the same data-driven way as
  // `searchTypes`: a per-scope override (e.g. Regions disallow it at `country`
  // level) wins, then the static `allowManual`, then off. (Functions can't be
  // passed through `admin.custom` — it's serialized to the client — so this is
  // data, not a condition function.)
  const manualAllowed =
    (config.searchTypesField ? config.allowManualByValue?.[scopeValue ?? ''] : undefined) ??
    config.allowManual ??
    false

  // Only fill a sibling that isn't already populated, so a chosen result never
  // clobbers a value the user (or a prior selection) already set.
  const setSibling = (siblingName: string, siblingValue: number | string | null | undefined) => {
    if (siblingValue === undefined || siblingValue === null || siblingValue === '') return
    const targetPath = toSiblingPath(path, siblingName)
    const existing = getDataByPath(targetPath)
    if (existing !== undefined && existing !== null && existing !== '') return
    dispatchFields({ type: 'UPDATE', path: targetPath, value: siblingValue })
  }

  const handleRetrieve = (res: MapboxRetrieveResponse) => {
    const feature = res?.features?.[0]
    if (!feature) return
    if (config.populateAddress) {
      const context = feature.properties?.context
      setSibling(
        'street',
        feature.properties?.address ?? context?.address?.name ?? feature.properties?.name,
      )
      setSibling('city', context?.place?.name)
      setSibling('region', resolveRegionCode(context?.region, context?.country?.country_code))
      setSibling('country', context?.country?.country_code)
      setSibling('postCode', context?.postcode?.name)
      const coordinates = feature.geometry?.coordinates
      if (coordinates) {
        setSibling('longitude', coordinates[0])
        setSibling('latitude', coordinates[1])
      }
    }
    // Regions: adopt the selected place's name (only if not already filled).
    if (config.populateName) {
      setSibling('name', feature.properties?.name)
    }
    // Set our own value last: this triggers the form's condition recompute, which
    // reveals dependent fields (the address siblings, or the manual-coordinates row).
    setValue(feature.properties?.mapbox_id ?? MANUAL)
  }

  const fieldClasses = [
    'field-type',
    'address-search',
    showError && 'error',
    readOnly && 'read-only',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={fieldClasses}>
      <FieldLabel label={label} localized={localized} path={path} required={required} />
      <div className="field-type__wrap">
        <FieldError path={path} showError={showError} />
        {/* Selected: the stored id (or the `manual` sentinel) shown as a single
            pill inside an input-styled control — the same chip ReactSelect
            renders, so it matches the rest of the admin. The dropdown chevron
            and clear-all indicator are removed (no menu here); the pill's own ✕
            clears it, which resets the value, re-reveals the search box, and
            re-hides the dependent fields. */}
        {value ? (
          <ReactSelect
            className="address-search__selected"
            isMulti
            isClearable={false}
            isSearchable={false}
            menuIsOpen={false}
            disabled={readOnly}
            options={[]}
            value={
              [
                { label: value == MANUAL ? 'Manual' : value, value },
              ] as unknown as ReactSelectOption[]
            }
            onChange={() => {
              setQuery('')
              setValue('')
            }}
            components={{
              DropdownIndicator: () => null,
              IndicatorSeparator: () => null,
            }}
          />
        ) : null}
        {/* Kept mounted (just hidden) while a value is selected so clearing the
            pill returns to it without a remount flicker. Remounts only on
            light/dark toggle or a search-scope change (key), so it always
            paints with concrete colors rather than Mapbox's default dark text. */}
        {token && theme && !readOnly ? (
          <div style={value ? { display: 'none' } : undefined}>
            <SearchBox
              key={`${theme.variables?.colorText}:${searchTypes}`}
              accessToken={token}
              onRetrieve={handleRetrieve}
              value={query}
              onChange={setQuery}
              placeholder={config.placeholder ?? 'Search for your address…'}
              options={{ types: searchTypes, language: 'en' }}
              theme={theme}
            />
          </div>
        ) : null}
        {!value && manualAllowed && !readOnly ? (
          <button type="button" className="address-search__toggle" onClick={() => setValue(MANUAL)}>
            Enter manually
          </button>
        ) : null}
        {!value && !token && !manualAllowed && !readOnly ? (
          <Banner type="error">
            Address search needs a Mapbox access token, and manual entry isn’t available here.
          </Banner>
        ) : null}
        <FieldDescription description={description} path={path} />
      </div>
    </div>
  )
}

export default AddressSearchField
