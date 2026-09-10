// Generate the bundled Path fixture from the prod snapshot.
// PathStepDto.fromJson expects Payload doc shape with flat strings + resolved
// relations; the snapshot is depth=0 + locale=all, so flatten/hydrate here.
//
// Deliberately omits introAudio / meditation / panel media: PathStepMediaPrewarmer
// builds a DefaultCacheManager (no web support), and bails early when there are
// no media urls.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'

const SNAP = 'temp_scripts/prod-snapshot'
const OUT = '/Users/antontcymbal/Projects/WeMeditate/WeMeditateApp/assets/preview'
const LOCALE = 'en'

const read = (f) => JSON.parse(readFileSync(`${SNAP}/${f}.json`, 'utf8'))
const lessons = read('lessons')
const images = new Map(read('images').map((i) => [i.id, i]))

const imageMap = (ref) => {
  const id = typeof ref === 'object' && ref ? ref.id : ref
  const img = images.get(id)
  return img?.url ? { id: img.id, url: img.url, filename: img.filename } : null
}

const IMAGE_KEYS = new Set(['icon', 'image', 'thumbnail'])
const isLocaleMap = (o) =>
  o &&
  typeof o === 'object' &&
  !Array.isArray(o) &&
  Object.keys(o).length > 0 &&
  Object.keys(o).every((k) => /^[a-z]{2}(-[A-Za-z]{2})?$/.test(k))

const shape = (node, key) => {
  if (Array.isArray(node)) return node.map((n) => shape(n, key))
  if (node && typeof node === 'object') {
    if (isLocaleMap(node)) return shape(node[LOCALE] ?? null, key)
    const out = {}
    for (const [k, v] of Object.entries(node)) out[k] = shape(v, k)
    return out
  }
  if (IMAGE_KEYS.has(key) && typeof node === 'number') return imageMap(node)
  return node
}

const steps = lessons
  .map((l) => shape(l))
  // Every step needs a title: PathLessonFlow.isVisibleOnPath filters the rest
  // out silently, and the timeline would just look short.
  .filter((l) => typeof l.title === 'string' && l.title.trim().length > 0)
  // step 0 of unit 1 is the "special first meditation" and triggers a video
  // prewarm; keep it out of the fixture.
  .filter((l) => !(String(l.unit).includes('1') && l.step === 0))
  .map(({ introAudio, introSubtitles, meditation, panels, ...rest }) => rest)
  .sort((a, b) => String(a.unit).localeCompare(String(b.unit)) || (a.step ?? 0) - (b.step ?? 0))

mkdirSync(OUT, { recursive: true })
writeFileSync(`${OUT}/path_fixture.json`, JSON.stringify({ steps }, null, 2))

const units = [...new Set(steps.map((s) => s.unit))]
console.log(`steps: ${steps.length} across units ${units.join(', ')}`)
console.log(`with icon: ${steps.filter((s) => s.icon).length}`)
console.log(
  `sample: ${steps
    .slice(0, 3)
    .map((s) => `${s.unit}/${s.step} ${s.title}`)
    .join(' | ')}`,
)
console.log(`wrote ${OUT}/path_fixture.json`)
