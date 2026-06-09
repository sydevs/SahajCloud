'use client'

import type { TextFieldClientComponent } from 'payload'

import { FieldLabel, useField, useForm } from '@payloadcms/ui'
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
 * Field component for the address `mapboxId` field: a Mapbox address search.
 * Selecting a result stores the Mapbox feature id (this field's value) and
 * populates the sibling address fields (street, city, region, country,
 * postCode, latitude, longitude) via the form. The other address fields are
 * hidden until `mapboxId` is set (see `addressFields`), so setting it here via
 * `useField().setValue` is what reveals them. "Enter manually" stores the
 * `manual` sentinel to reveal the empty fields for hand entry; that path is
 * also the fallback when no `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is configured.
 */
export const AddressSearchField: TextFieldClientComponent = ({ field, path }) => {
  const { label } = field
  const { value, setValue } = useField<string>({ path })
  const { dispatchFields } = useForm()
  const theme = usePayloadSearchTheme()
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

  const setSibling = (siblingName: string, siblingValue: number | string | null | undefined) => {
    if (siblingValue === undefined || siblingValue === null || siblingValue === '') return
    dispatchFields({ type: 'UPDATE', path: toSiblingPath(path, siblingName), value: siblingValue })
  }

  const handleRetrieve = (res: MapboxRetrieveResponse) => {
    const feature = res?.features?.[0]
    if (!feature) return
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
    // Set our own value last: this triggers the form's condition recompute, which
    // reveals the (now-populated) sibling fields.
    setValue(feature.properties?.mapbox_id ?? MANUAL)
  }

  return (
    <div className="field-type address-search">
      <FieldLabel label={label} path={path} />
      {token && theme ? (
        // Mount only once the theme is resolved, and remount on light/dark
        // toggle (key), so the search box always paints with the correct,
        // concrete colors rather than Mapbox's default dark text.
        <SearchBox
          key={theme.variables?.colorText}
          accessToken={token}
          onRetrieve={handleRetrieve}
          placeholder="Search for your address…"
          options={{ types: 'address,poi', language: 'en' }}
          theme={theme}
        />
      ) : null}
      {!value ? (
        <button type="button" className="address-search__toggle" onClick={() => setValue(MANUAL)}>
          Enter manually
        </button>
      ) : null}
    </div>
  )
}

export default AddressSearchField
