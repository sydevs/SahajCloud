// Normalise the audit outputs before merging.
//
// 1. One agent emitted `dead` as objects ({key,section,description}) rather than
//    key strings — unwrap those.
// 2. Conservative deletion rule for this unattended run: only a PHANTOM (a key
//    absent from the app's own en.yaml, so it could never render — the same
//    precedent as path.step_3.pre_meditation_lines) is actually removed.
//    Anything else that is merely unused is KEPT and flagged in a trailing
//    "Currently unused — needs a product decision" section, so a human decides.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

const DIR = 'temp_scripts/specs-out'
const UNUSED = 'Currently unused — needs a product decision'

// Keys confirmed absent from the app's en.yaml entirely — safe to remove.
const PHANTOMS = new Set(['meditation.intent::repeat_video'])

// Descriptions for string-form dead keys we are converting back into rows.
const KEPT_DESC = {
  'profile.main::joined_less_than_year':
    'Appears unused — the app’s five “member since” options never pick this one. Kept pending a product decision.',
  'profile.contact::subtitle':
    'Appears unused — it duplicates the header line above and is never read. Kept pending a product decision.',
  'profile.contact::empty_error':
    'Appears unused — sending an empty message shows the minimum-length message instead. Kept pending a product decision.',
}

let moved = 0
let removed = 0

for (const f of readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const path = `${DIR}/${f}`
  const arr = JSON.parse(readFileSync(path, 'utf8'))
  for (const s of arr) {
    const keepDead = []
    for (const entry of s.dead || []) {
      const key = typeof entry === 'string' ? entry : entry.key
      const id = `${s.leaf}::${key}`
      if (PHANTOMS.has(id)) {
        keepDead.push(key)
        removed++
        continue
      }
      const description =
        (typeof entry === 'object' && entry.description) ||
        KEPT_DESC[id] ||
        'Appears unused — not shown anywhere in the app. Kept pending a product decision.'
      s.order.push({ key, section: UNUSED, description })
      moved++
    }
    s.dead = keepDead
  }
  writeFileSync(path, JSON.stringify(arr, null, 2) + '\n')
}

console.log(`kept+flagged ${moved} unused keys; removing ${removed} phantom(s)`)
