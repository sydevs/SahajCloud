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
 *
 * ⚠ **The subdivision narrowing is best-effort, and that is measured rather than
 * conceded.** 19 of the Atlas tree's 101 `region` nodes match no ISO 3166-2
 * subdivision — every UK one among them, because `country-region-data` lists
 * GB's 217 councils and no England, Scotland, Wales or Northern Ireland. So a
 * refusal here would make the whole UK, and parts of France and Italy,
 * unimportable. It degrades to the country instead and says so, because nothing
 * structural rests on it: the proposal step creates every node **under** the
 * target, so a row cannot leave the subtree either way. What the narrowing buys
 * is catching a row for the wrong end of a country early, and that is worth
 * having where it works and reporting where it does not.
 *
 * ⚠ **A dependent territory is scoped as the country Mapbox files it as.**
 * `country-region-data` lists Martinique as `FR-MQ`, but Mapbox answers with
 * country `MQ` and no French subdivision, so a scope of `{ FR, MQ }` refused
 * every row there. Such a target is scoped `MQ` instead, and remembers `FR`
 * only so a row's own `country` column may say either.
 */

import { countryCodeForName, isCountryCode, subdivisionCodeFor } from '@/lib/geography'
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
  /**
   * Set only for a dependent territory: the country the region tree files it
   * under (`FR`), where `countryCode` is the one Mapbox does (`MQ`).
   */
  parentCountryCode?: string
}

export type ResolveTargetScopeResult =
  | {
      ok: true
      scope: TargetScope
      /** The narrowing this target does not get, for the review to show once. */
      warning?: string
    }
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

  const territory = territoryCodeOf(state, countryCode)
  if (territory) {
    return {
      ok: true,
      scope: { countryCode: territory, subdivisionCode: null, parentCountryCode: countryCode },
    }
  }

  const subdivisionCode = subdivisionCodeOf(state, countryCode)
  if (!subdivisionCode) {
    return {
      ok: true,
      scope: { countryCode, subdivisionCode: null },
      warning: `"${state.name ?? state.slug ?? '?'}" matches no ISO 3166-2 subdivision of ${countryCode}, so rows are confined to ${countryCode} but not to it. Check the proposed tree before committing.`,
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

/**
 * The same two readings for a state, against its own country's subdivisions.
 *
 * ⚠ **Both readings are `subdivisionCodeFor`'s**, so the slug is tried before the
 * name here only to keep the node's own precedence — a region whose slug names one
 * subdivision and whose name names another resolves to the slug, as it always has.
 */
function subdivisionCodeOf(node: TargetChainNode, countryCode: string): string | null {
  return subdivisionCodeFor(countryCode, node.slug) ?? subdivisionCodeFor(countryCode, node.name)
}

/**
 * Territories a geocoder files as countries of their own, by the code the
 * region tree reaches them through — a subdivision code where
 * `country-region-data` lists one under the parent (`FR-MQ`, `NO-21`), or else
 * the territory's own country code, which a state node's name or slug gives.
 *
 * `FM`, `MH` and `PW` are sovereign rather than dependent, and are here because
 * the dataset lists them under `US` all the same.
 */
const TERRITORIES: Partial<Record<string, Record<string, string>>> = {
  FR: {
    GP: 'GP',
    MQ: 'MQ',
    GF: 'GF',
    RE: 'RE',
    YT: 'YT',
    PM: 'PM',
    BL: 'BL',
    MF: 'MF',
    WF: 'WF',
    PF: 'PF',
    NC: 'NC',
    TF: 'TF',
  },
  US: {
    PR: 'PR',
    GU: 'GU',
    VI: 'VI',
    AS: 'AS',
    MP: 'MP',
    UM: 'UM',
    FM: 'FM',
    MH: 'MH',
    PW: 'PW',
  },
  NL: { AW: 'AW', CW: 'CW', SX: 'SX', BQ: 'BQ' },
  DK: { GL: 'GL', FO: 'FO' },
  NO: { '21': 'SJ', '22': 'SJ' },
  CN: { HK: 'HK', MO: 'MO' },
  AU: { CX: 'CX', CC: 'CC', NF: 'NF' },
  FI: { 'FI-01': 'AX' },
}

/** The ISO 3166-1 code of the territory a state node names, or null for an ordinary state. */
function territoryCodeOf(node: TargetChainNode, countryCode: string): string | null {
  const territories = TERRITORIES[countryCode]
  if (!territories) return null
  const subdivision = subdivisionCodeOf(node, countryCode)
  if (subdivision && territories[subdivision]) return territories[subdivision]
  const named = countryCodeOf(node)
  return named && Object.values(territories).includes(named) ? named : null
}
