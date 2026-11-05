/**
 * The delta report a build writes beside the data: what moved upstream since
 * the overlay was recorded, and the duplicate candidates a groomer must rule
 * on. Candidates are evidence to check, never merges — every merge is decided
 * by hand and written into `merges.ts` / `dedupe.ts` (seeds/atlas/AGENTS.md).
 */
import type { AtlasExpectedCounts } from './counts'
import type { RowOutcome, Row } from './overlay'

type Tables = Record<string, Row[]>

export interface ReportInput {
  rawId: string
  previousRawId: string
  built: Tables
  previousRaw: Tables | null
  outcomes: RowOutcome[]
  venueOutcomes: RowOutcome[]
  deletedUpstream: Record<string, string[] | undefined>
  expectedCounts: AtlasExpectedCounts
}

const slot = (e: Row): string => {
  const s = e.schedule as Record<string, unknown> | null
  return s ? [s.frequency, s.interval, s.weekday, s.weekNumber, s.startTime].join('|') : 'none'
}

const metres = (a: Row, b: Row): number => {
  const rad = Math.PI / 180
  const [lat1, lon1, lat2, lon2] = [a.latitude, a.longitude, b.latitude, b.longitude].map(Number)
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad)
  const y = (lat2 - lat1) * rad
  return Math.sqrt(x * x + y * y) * 6_371_000
}

const norm = (v: unknown): string =>
  String(v ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Same venue (or Zoom room) and an identical slot — the #605 evidence bar, before the manager check. */
export function duplicateEventCandidates(events: Row[], focus: Set<number>) {
  const groups = new Map<string, Row[]>()
  for (const e of events) {
    const place =
      e.venueId != null ? `venue:${e.venueId}` : e.onlineUrl ? `url:${norm(e.onlineUrl)}` : null
    if (!place) continue
    const key = `${place}#${slot(e)}`
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  return [...groups.entries()]
    .filter(([, rows]) => rows.length > 1 && rows.some((r) => focus.has(r.legacyId)))
    .map(([key, rows]) => ({
      key,
      events: rows.map((r) => ({
        legacyId: r.legacyId,
        managerId: r.managerId,
        status: r.status,
        title: r.customName,
        finishDate: r.finishDate,
        createdAt: r.createdAt,
      })),
      sameManager: new Set(rows.map((r) => r.managerId)).size === 1,
    }))
}

/** Venue rows within 150 m of each other, or sharing a normalized street and city. */
export function duplicateVenueCandidates(venues: Row[], focus: Set<number>) {
  const out: { keep?: number; pair: [number, number]; metres: number; why: string }[] = []
  for (const a of venues) {
    if (!focus.has(a.legacyId)) continue
    for (const b of venues) {
      if (a.legacyId === b.legacyId || (focus.has(b.legacyId) && b.legacyId < a.legacyId)) continue
      const d = metres(a, b)
      const sameStreet =
        norm(a.street) !== '' && norm(a.street) === norm(b.street) && norm(a.city) === norm(b.city)
      if (d < 150 || sameStreet) {
        out.push({
          pair: [a.legacyId, b.legacyId],
          metres: Math.round(d),
          why: sameStreet ? 'same street' : 'near',
        })
      }
    }
  }
  return out
}

/** Area rows naming the same place in the same country — Atlas re-enters cities. */
export function duplicateAreaCandidates(regions: Row[], focus: Set<string>) {
  const areas = regions.filter((r) => r.level === 'area')
  const out: { pair: [number, number]; name: string; metres: number | null }[] = []
  for (const a of areas) {
    if (!focus.has(`area:${a.legacyId}`)) continue
    for (const b of areas) {
      if (a.legacyId === b.legacyId || a.countryCode !== b.countryCode) continue
      const d = a.latitude != null && b.latitude != null ? metres(a, b) : null
      if (norm(a.name) === norm(b.name) || (d != null && d < 1000)) {
        out.push({
          pair: [a.legacyId, b.legacyId],
          name: String(a.name),
          metres: d == null ? null : Math.round(d),
        })
      }
    }
  }
  return out
}

const keyed = (rows: Row[] | undefined, key: (r: Row) => string) =>
  new Map((rows ?? []).map((r) => [key(r), r]))

/** Rows added, removed, and changed in the listed fields, between two raw extractions. */
function diffTable(
  now: Row[],
  before: Row[] | undefined,
  key: (r: Row) => string,
  fields: string[],
) {
  const a = keyed(before, key)
  const b = keyed(now, key)
  return {
    added: [...b.keys()].filter((k) => !a.has(k)),
    removed: [...a.keys()].filter((k) => !b.has(k)),
    changed: [...b.entries()]
      .filter(([k]) => a.has(k))
      .flatMap(([k, row]) => {
        const moved = fields.filter(
          (f) => JSON.stringify(row[f] ?? null) !== JSON.stringify(a.get(k)![f] ?? null),
        )
        return moved.length ? [{ key: k, fields: moved }] : []
      }),
  }
}

export function buildReport(input: ReportInput): { json: unknown; markdown: string } {
  const { built, previousRaw, outcomes } = input
  const byStatus = (s: string) => outcomes.filter((o) => o.status === s)
  const focusEvents = new Set(
    outcomes.filter((o) => o.status !== 'unchanged').map((o) => o.legacyId),
  )
  const focusVenues = new Set(
    input.venueOutcomes.filter((o) => o.status !== 'unchanged').map((o) => o.legacyId),
  )
  const geoKey = (r: Row) => `${r.level}:${r.legacyId}`

  const geo = diffTable(built.regions, previousRaw?.regions, geoKey, ['name', 'parent'])
  const managers = diffTable(built.managers, previousRaw?.managers, (r) => String(r.legacyId), [
    'name',
    'email',
    'type',
    'languageCode',
    'phone',
    'contactMethod',
    'notifications',
    'customResourceAccess',
  ])
  const clients = diffTable(built.clients, previousRaw?.clients, (r) => String(r.legacyId), [
    'label',
    'config',
    'managerId',
    'enabled',
    'location',
  ])

  const json = {
    rawId: input.rawId,
    since: input.previousRawId,
    expectedCounts: input.expectedCounts,
    events: {
      new: byStatus('new').map((o) => o.legacyId),
      changed: byStatus('changed'),
      unchanged: byStatus('unchanged').length,
      deletedUpstream: input.deletedUpstream.events ?? [],
    },
    venues: {
      new: input.venueOutcomes.filter((o) => o.status === 'new').map((o) => o.legacyId),
      changed: input.venueOutcomes.filter((o) => o.status === 'changed'),
      deletedUpstream: input.deletedUpstream.venues ?? [],
    },
    regions: geo,
    managers,
    clients,
    candidates: {
      events: duplicateEventCandidates(built.events, focusEvents),
      venues: duplicateVenueCandidates(built.venues, focusVenues),
      areas: duplicateAreaCandidates(built.regions, new Set(geo.added)),
    },
  }

  const list = (ids: (number | string)[]) => (ids.length ? ids.join(', ') : '—')
  const md = [
    `# Atlas sync report — ${input.rawId}`,
    '',
    `Overlay recorded against **${input.previousRawId}**. Expected counts: \`${JSON.stringify(input.expectedCounts)}\``,
    '',
    '## Events',
    `- New (groom from scratch): ${json.events.new.length} — ${list(json.events.new)}`,
    `- Changed upstream (groom three-way): ${json.events.changed.length} — ${list(json.events.changed.map((o) => o.legacyId))}`,
    `- Unchanged (curation re-applied): ${json.events.unchanged}`,
    `- Deleted upstream: ${json.events.deletedUpstream.length} — ${list(json.events.deletedUpstream)}`,
    '',
    '## Venues',
    `- New: ${json.venues.new.length}; changed: ${json.venues.changed.length}; deleted upstream: ${json.venues.deletedUpstream.length}`,
    '',
    '## Geo nodes',
    `- Added: ${list(geo.added)}`,
    `- Removed (renumbered or deleted in Atlas): ${list(geo.removed)}`,
    `- Renamed or reparented: ${list(geo.changed.map((c) => c.key))}`,
    '',
    '## Managers',
    `- Added: ${managers.added.length}; removed (pruned by an --update seed): ${managers.removed.length} — ${list(managers.removed)}`,
    `- Changed: ${managers.changed.length} (${managers.changed.filter((c) => c.fields.includes('email')).length} email changes)`,
    '',
    '## Clients',
    `- Added: ${list(clients.added)}; removed (left alone in SahajCloud): ${list(clients.removed)}`,
    `- Changed: ${list(clients.changed.map((c) => `${c.key} (${c.fields.join(', ')})`))}`,
    '',
    '## Duplicate candidates (rule on each by hand)',
    `- Events sharing a venue or room and a slot: ${json.candidates.events.length}`,
    ...json.candidates.events.map(
      (c) =>
        `  - ${c.key}: ${c.events.map((e) => `#${e.legacyId} (m${e.managerId}, status ${e.status})`).join(' / ')}${c.sameManager ? ' — same manager' : ''}`,
    ),
    `- Venues: ${json.candidates.venues.length}`,
    ...json.candidates.venues.map((c) => `  - ${c.pair.join(' ↔ ')} (${c.why}, ${c.metres} m)`),
    `- Areas: ${json.candidates.areas.length}`,
    ...json.candidates.areas.map(
      (c) => `  - ${c.pair.join(' ↔ ')} "${c.name}" (${c.metres ?? '?'} m)`,
    ),
    '',
  ].join('\n')

  return { json, markdown: md }
}
