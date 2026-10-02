/**
 * Whether a batch's cities get a state layer above them, and what it is called.
 *
 * ⚠ **The layer is proposed, never required.** The Atlas region tree is mixed on
 * purpose — France's cities hang straight off the country — so the question is
 * not "does this country have states" but "would a layer shorten the path a
 * seeker takes". Both thresholds are about that: a layer earns its place only
 * when it groups something (two or more subdivisions) into a list worth
 * shortening (`STATE_LAYER_MIN_CITIES` or more cities).
 *
 * A state target already *is* the layer, so only a country target can gain one.
 */

import { getRegionOptions } from '@/lib/geography'
import type { Region } from '@/payload-types'

import { STATE_LAYER_MIN_CITIES, STATE_LAYER_MIN_SUBDIVISIONS } from '../constants'

/** What the decision reads off each proposed city. */
export interface StateLayerCity {
  key: string
  /** ISO 3166-2 of the subdivision the city's classes mostly sit in, or null. */
  subdivisionCode: string | null
}

export interface ProposedState {
  /** ISO 3166-2 subdivision code, which is also the node's slug source. */
  code: string
  /** The subdivision's own name, as ISO 3166-2 lists it. */
  name: string
  /** The cities that hang under it, in the order they were proposed. */
  cityKeys: string[]
}

export type StateLayerDecision =
  | {
      proposed: true
      states: ProposedState[]
      /**
       * Cities the layer cannot place, which hang off the country instead.
       *
       * ⚠ **They are not an error.** A city whose rows geocoded without a
       * subdivision, or into one ISO does not list, is still a city in the target
       * country — and the tree already holds cities directly under a country, so
       * there is somewhere correct to put it.
       */
      unplacedCityKeys: string[]
    }
  | { proposed: false; reason: string }

export interface StateLayerArgs {
  /** The target's own level — only `country` can gain a layer beneath it. */
  targetLevel: Region['level']
  /** The target country's ISO alpha-2, for naming the subdivisions. */
  countryCode: string
  /** The proposed cities, after the metro merge. */
  cities: readonly StateLayerCity[]
}

export function decideStateLayer({
  targetLevel,
  countryCode,
  cities,
}: StateLayerArgs): StateLayerDecision {
  if (targetLevel !== 'country') {
    return {
      proposed: false,
      reason: `A ${targetLevel}-level target gains no state layer — cities are proposed directly under it.`,
    }
  }

  if (cities.length < STATE_LAYER_MIN_CITIES) {
    return {
      proposed: false,
      reason: `${cities.length} ${cities.length === 1 ? 'city' : 'cities'} is a short enough list to read under the country, so no state layer is proposed (the threshold is ${STATE_LAYER_MIN_CITIES}).`,
    }
  }

  const options = getRegionOptions(countryCode)
  const named = new Map(options.map((option) => [option.value.toUpperCase(), option.label]))

  // Grouped before the subdivision threshold, which counts what the grouping
  // produced: a city ISO cannot place is not a state, so a batch spanning one
  // subdivision plus a dozen unplaceable cities is not two.
  const grouped = new Map<string, ProposedState>()
  const unplacedCityKeys: string[] = []
  for (const city of cities) {
    const code = city.subdivisionCode?.trim().toUpperCase()
    const name = code ? named.get(code) : undefined
    if (!code || !name) {
      unplacedCityKeys.push(city.key)
      continue
    }
    const state = grouped.get(code)
    if (state) state.cityKeys.push(city.key)
    else grouped.set(code, { code, name, cityKeys: [city.key] })
  }

  if (grouped.size < STATE_LAYER_MIN_SUBDIVISIONS) {
    return {
      proposed: false,
      reason:
        grouped.size === 0
          ? 'No city resolved to a subdivision this country lists, so no state layer is proposed.'
          : `Every placeable city is in ${grouped.values().next().value!.name}, so a state layer would add a level without grouping anything.`,
    }
  }

  // Alphabetical by name, which is the order the tree shows them in. The code is
  // the tie-break for two subdivisions ISO gives the same name.
  const states = [...grouped.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code),
  )
  return { proposed: true, states, unplacedCityKeys }
}
