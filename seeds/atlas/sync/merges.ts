/**
 * Curation decisions that are ids, not data: which Atlas events never become
 * listings, which surviving listing inherits a removed one's registrants, and
 * which Atlas services are left out or split in two.
 *
 * Applied by `build`, locally, so a new decision at a later sync needs no
 * deploy — the importer only ever sees the result. The evidence behind every
 * entry is in seeds/atlas/AGENTS.md ("Merged duplicates"). An entry whose row
 * Atlas has since deleted stays, so an older dump can never resurrect it.
 */

/** Atlas events that must never become listings: test records and merged-away duplicates. */
export const EXCLUDED_EVENT_LEGACY_IDS = new Map<number, string>([
  // ── #605 pass (2024 dump)
  [494, 'Atlas test record'],
  [575, 'Atlas test record'],
  [195, 'duplicate — same Zoom room + slot as #603'],
  [752, 'duplicate — merged into the bilingual #753'],
  [360, 'duplicate — retired half of the pair kept as #684'],
  [392, 'duplicate — retired half of the pair kept as #698'],
  [458, 'duplicate — retired half of the pair kept as #560'],
  [461, 'duplicate — retired half of the pair kept as #565'],
  [464, 'duplicate — retired half of the pair kept as #562'],
  [468, 'duplicate — retired half of the pair kept as #570'],
  [469, 'duplicate — retired half of the pair kept as #571'],
  [82, 'duplicate of #496; both sides already retired'],
  [496, 'duplicate of #82; both sides already retired'],
  [497, 'duplicate of #534; both sides already retired'],
  [534, 'duplicate of #497; both sides already retired'],
  [355, 'duplicate of #535; both sides already retired'],
  [535, 'duplicate of #355; both sides already retired'],
  // ── 2026-08 refresh (#621). Same evidence bar: same manager, plus a shared
  // venue or Zoom room, and an identical slot. "Session re-listing" means
  // sequential, non-overlapping terms of one class; the latest term survives.
  [2951, 'duplicate — re-entered as #3440 (same manager, venue, slot)'],
  [1988, 'duplicate — superseded by #4662 (same manager, library, slot)'],
  [1328, 'duplicate — session re-listing; open-ended term kept as #2945'],
  [3078, 'duplicate — session re-listing; latest term kept as #4332'],
  [4331, 'duplicate — session re-listing; latest term kept as #4332'],
  [4365, 'duplicate — triple entry of #4364 (identical rows)'],
  [4366, 'duplicate — triple entry of #4364 (identical rows)'],
  [4299, 'duplicate — merged into the bilingual #4298 (FR/NL pair)'],
  [5849, 'duplicate — double entry of #5684 (identical rows)'],
])

/**
 * Merge survivors for removed duplicates. A merge is not a delete, so a
 * registration on the removed listing belongs to the class that survived it.
 * A pair with no living survivor has no entry, and its registrations are
 * skipped as unresolvable.
 */
export const MERGED_EVENT_TARGETS: Readonly<Record<number, number>> = {
  195: 603,
  752: 753,
  360: 684,
  392: 698,
  458: 560,
  461: 565,
  464: 562,
  2951: 3440,
  1988: 4662,
  1328: 2945,
  3078: 4332,
  4331: 4332,
  4365: 4364,
  4366: 4364,
  4299: 4298,
  5849: 5684,
}

/**
 * Geo nodes that fail on every import, which the regions floor discounts.
 * Keyed `level:legacyId` as in regions.json.
 */
export const UNIMPORTABLE_REGIONS = new Map<string, string>([
  ['region:42', 'East (GB): Atlas osm id "custom" and no coordinates, so it geocodes to nothing'],
])

/**
 * Atlas services that must never become SahajCloud services. The importer
 * never deletes, so leaving one out of the data is what keeps a deleted service
 * deleted (#1055).
 */
export const EXCLUDED_CLIENT_LEGACY_IDS = new Map<number, string>([
  [33, 'Sahaj Atlas Dev — a localhost key nothing serves'],
  [
    66,
    'Sahaj Atlas — the legacy widget hosts; SahajCloud’s own “Sahaj Atlas” service holds the live key',
  ],
])

/**
 * A second site on one Atlas service, made a service of its own, because a
 * service is one site (#1055).
 *
 * ⚠ **`legacyId` is negative**, so it cannot collide with an Atlas serial id,
 * and the importer's upsert finds the same service again on every re-sync.
 *
 * ⚠ **The region is matched by name under the source's country**, never by
 * id, because Atlas renumbers geo nodes between dumps. Without a region of its
 * own the service would sit on its source's country, where the first site to
 * pass a check claims the whole country's links.
 */
export const CLIENT_SPLITS: readonly {
  from: number
  legacyId: number
  label: string
  domain: string
  regionName: string
}[] = [
  {
    from: 32,
    legacyId: -32,
    label: 'Yoga Essonne',
    domain: 'yogaessonne.fr',
    regionName: 'Ile-de-France',
  },
]

type GeoRow = { legacyId: number; level?: unknown; name?: unknown; parent?: unknown }
type ClientRow = { legacyId: number; config?: unknown; location?: unknown }

/**
 * Apply both client decisions: drop the excluded services, and give each split
 * site its own row, taken out of its source's domain list.
 *
 * A split whose source Atlas has since deleted emits nothing. One whose region
 * matches no row, or more than one, throws: the import would otherwise put the
 * site on its country.
 */
export function applyClientDecisions<C extends ClientRow>(clients: C[], regions: GeoRow[]): C[] {
  const out = clients.filter((client) => !EXCLUDED_CLIENT_LEGACY_IDS.has(client.legacyId))

  for (const split of CLIENT_SPLITS) {
    const at = out.findIndex((client) => client.legacyId === split.from)
    if (at === -1) continue
    const source = out[at]
    const config = (source.config ?? {}) as Record<string, unknown>
    const country = source.location as { level?: unknown; legacyId?: unknown } | null | undefined
    const matches = regions.filter((region) => {
      const parent = region.parent as { level?: unknown; legacyId?: unknown } | null | undefined
      return (
        region.level === 'region' &&
        region.name === split.regionName &&
        parent?.level === country?.level &&
        parent?.legacyId === country?.legacyId
      )
    })
    if (matches.length !== 1) {
      throw new Error(
        `Client split ${split.label} (#${split.from}): ${matches.length} regions named ` +
          `"${split.regionName}" under the source's country. Update CLIENT_SPLITS in merges.ts.`,
      )
    }

    // The source keeps every other host it lists; the importer reads the first.
    const domains = String(config.domain ?? '')
      .split(/[\s,]+/)
      .filter((host) => host && host !== split.domain)
    out[at] = { ...source, config: { ...config, domain: domains.join('\n') } }
    out.push({
      ...source,
      legacyId: split.legacyId,
      label: split.label,
      // Each service has its own public identifier; the Clients hook mints one.
      clientId: null,
      config: { ...config, domain: split.domain },
      location: { level: 'region', legacyId: matches[0].legacyId },
      splitFrom: split.from,
    })
  }

  return out
}
