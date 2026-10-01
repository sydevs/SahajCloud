/**
 * What "inside the target region" means, in codes a geocoded row can be
 * compared against.
 *
 * ⚠ **Every row has to be confined to the batch's target, and the region tree
 * stores no code to confine it with.** `Regions` carries a `name`, a `slug` and
 * a `mapboxId` — no ISO country or subdivision column — while a geocoded row
 * comes back with `country.country_code` and `region.region_code`. So the chain
 * above the target is reduced here, once per request, to the two codes a row
 * can be checked against.
 *
 * ⚠ **A chain that yields no code is a refusal, never an unchecked import.** It
 * fails the whole batch with the region named, because the alternative is
 * admitting every row in the world into somebody's country. That is why the
 * subdivision is `null` only when the chain holds no state node at all, and an
 * unresolvable one is an error instead.
 *
 * ⚠ **A city target is confined no more tightly than its state, or than its
 * country where the tree has no state layer.** Only `country` and `region` nodes
 * are read, because they are the two levels an ISO code exists for — a city has
 * none, and matching its name against Mapbox's would refuse München to anyone
 * whose admin locale spells it Munich. So the row-level answer for a city target
 * is the city match itself, which belongs to the step that matches a proposed
 * node to an existing region. Until that lands, a city-level batch can place a
 * row anywhere in its state.
 */

import { countryCodeForName, getRegionOptions, isCountryCode } from '@/lib/geography'
import type { Region } from '@/payload-types'

/** The fields this reads off each region in the chain. */
export interface TargetChainNode {
  level: Region['level']
  name?: string | null
  slug?: string | null
}

export interface TargetScope {
  /** ISO alpha-2. Every row must geocode inside it. */
  countryCode: string
  /**
   * ISO 3166-2 subdivision code, or null when the target hangs straight off its
   * country — the mixed tree the Atlas already has (FR has no state layer).
   */
  subdivisionCode: string | null
}

export type ResolveTargetScopeResult =
  | { ok: true; scope: TargetScope }
  /** Shown once for the batch, not per row. */
  | { ok: false; error: string }

/**
 * The two codes a row is checked against, or why the target cannot be checked.
 *
 * `chain` is the target's breadcrumb trail including the target itself, nearest
 * last — the shape `breadcrumbs` already stores.
 */
export function resolveTargetScope(chain: readonly TargetChainNode[]): ResolveTargetScopeResult {
  const country = chain.find((node) => node.level === 'country')
  if (!country) {
    return {
      ok: false,
      error: 'The target region has no country above it, so rows cannot be confined to one.',
    }
  }

  const countryCode = countryCodeOf(country)
  if (!countryCode) {
    return {
      ok: false,
      error: `The country region "${country.name ?? country.slug ?? '?'}" matches no ISO country — its slug is not a country code and its name is not a country name. Fix one of the two before importing.`,
    }
  }

  const state = chain.find((node) => node.level === 'region')
  if (!state) return { ok: true, scope: { countryCode, subdivisionCode: null } }

  const subdivisionCode = subdivisionCodeOf(state, countryCode)
  if (!subdivisionCode) {
    return {
      ok: false,
      error: `The region "${state.name ?? state.slug ?? '?'}" matches no ISO 3166-2 subdivision of ${countryCode}, so rows cannot be confined to it. Rename it to the subdivision's English name, or import into the country instead.`,
    }
  }
  return { ok: true, scope: { countryCode, subdivisionCode } }
}

/**
 * A country region's ISO alpha-2 code.
 *
 * The slug is tried first because the Atlas seed assigns a country its code as
 * its slug, and the Sahaj Atlas already derives the flag and the localized name
 * from that (#556). The name is the fallback for a country added by hand since,
 * which slugs from its name like every other node.
 */
function countryCodeOf(node: TargetChainNode): string | null {
  const fromSlug = node.slug?.trim().toUpperCase()
  if (fromSlug && isCountryCode(fromSlug)) return fromSlug
  return countryCodeForName(node.name)
}

/** The same two readings for a state, against its own country's subdivisions. */
function subdivisionCodeOf(node: TargetChainNode, countryCode: string): string | null {
  const options = getRegionOptions(countryCode)
  const fromSlug = node.slug?.trim().toUpperCase()
  if (fromSlug && options.some((option) => option.value === fromSlug)) return fromSlug

  const name = node.name?.trim().toLowerCase()
  if (!name) return null
  return options.find((option) => option.label.toLowerCase() === name)?.value ?? null
}
