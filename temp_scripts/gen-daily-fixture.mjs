// Generate a bundled preview fixture for the app's Daily screen from the prod
// snapshot. Real prod records, flattened into the shape the APP's parsers expect
// (single locale, relationships resolved) — the snapshot itself is depth=0 +
// locale=all, which MeditationMetadata.fromJson cannot read.
//
// Output ships as a Flutter asset so the web preview never fetches anything.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const SNAP = 'temp_scripts/prod-snapshot'
const OUT = '/Users/antontcymbal/Projects/WeMeditate/WeMeditateApp/assets/preview'
const LOCALE = 'en'

const read = (f) => JSON.parse(readFileSync(`${SNAP}/${f}.json`, 'utf8'))
const meditations = read('meditations')
const images = new Map(read('images').map((i) => [i.id, i]))

// {en: "x"} -> "x"
const flat = (v) => (v && typeof v === 'object' && !Array.isArray(v) && LOCALE in v ? v[LOCALE] : v)

const imageUrl = (ref) => {
  const id = typeof ref === 'object' && ref ? ref.id : ref
  const img = images.get(id)
  return img?.url ?? null
}

// Shape one meditation the way GET /api/meditations?depth=1&locale=en returns it,
// i.e. what MeditationMetadata.fromJson reads.
const toMetadata = (m) => ({
  id: String(m.id),
  title: flat(m.title),
  label: flat(m.label),
  type: m.type,
  durationMinutes: m.durationMinutes ?? 0,
  thumbnailURL: imageUrl(m.thumbnail),
  url: String(m.id),
})

const withThumb = meditations.filter((m) => imageUrl(m.thumbnail) && flat(m.title))

// A realistic Daily: one "top" meditation + a few quick ones. Prefer variety in
// title length so the layout is exercised (long titles are the wrap risk).
const byLen = [...withThumb].sort(
  (a, b) => String(flat(b.title)).length - String(flat(a.title)).length,
)
const top = byLen[0] // longest title = worst case for the hero card
const quick = withThumb.filter((m) => m.id !== top.id).slice(0, 6)

// ---- app cards -------------------------------------------------------------
// AppCard.fromJson reads the `default` view group and wants populated image
// maps + flat strings; the snapshot has {en: ...} and bare image ids.
const appCards = read('app-cards')

const imageMap = (ref) => {
  const id = typeof ref === 'object' && ref ? ref.id : ref
  const img = images.get(id)
  if (!img?.url) return null
  return {
    id: img.id,
    url: img.url,
    filename: img.filename,
    mimeType: img.mimeType,
    width: img.width,
    height: img.height,
  }
}

const IMAGE_KEYS = new Set(['image', 'buttonIcon', 'thumbnail'])

// Recursively flatten {en: x} -> x and hydrate image refs.
const shape = (node, key) => {
  if (Array.isArray(node)) return node.map((n) => shape(n, key))
  if (node && typeof node === 'object') {
    if (LOCALE in node && Object.keys(node).every((k) => /^[a-z]{2}(-[A-Za-z]{2})?$/.test(k))) {
      return shape(node[LOCALE], key)
    }
    const out = {}
    for (const [k, v] of Object.entries(node)) out[k] = shape(v, k)
    return out
  }
  if (IMAGE_KEYS.has(key) && typeof node === 'number') return imageMap(node)
  return node
}

const toCard = (c) => shape(c)
const heroCards = appCards.filter((c) => (c.targetSections ?? []).includes('hero'))
const highlightCards = appCards.filter((c) => (c.targetSections ?? []).includes('highlights'))
// Prefer a hero that actually resolves an image, else the screen falls back.
const hero = heroCards.find((c) => imageMap(c.default?.image)) ?? heroCards[0]

const fixture = {
  _generated: 'temp_scripts/gen-daily-fixture.mjs — real prod records, do not hand-edit',
  topMeditation: toMetadata(top),
  quickMeditations: quick.map(toMetadata),
  heroAppCard: hero ? toCard(hero) : null,
  highlightAppCards: highlightCards.slice(0, 4).map(toCard),
}
console.log(
  `hero: ${hero ? shape(hero.default?.title, 'title') : 'none'} | highlights: ${fixture.highlightAppCards.length}`,
)

mkdirSync(OUT, { recursive: true })
writeFileSync(`${OUT}/daily_fixture.json`, JSON.stringify(fixture, null, 2))
console.log(`top: ${fixture.topMeditation.title} (${fixture.topMeditation.durationMinutes}m)`)
console.log(
  `quick: ${fixture.quickMeditations.length} -> ${fixture.quickMeditations
    .map((q) => q.title)
    .join(' | ')
    .slice(0, 90)}`,
)
console.log(`wrote ${OUT}/daily_fixture.json`)
