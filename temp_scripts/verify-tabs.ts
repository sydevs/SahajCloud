// Structural verification of the authored IA without a DB or browser: run the
// REAL builder (buildTranslationTabs) over translationsSchema.json and assert
// the admin structure a translator will see — tab labels, sub-tab labels,
// section grouping/contiguity, and that every key carries a description.
//   pnpm exec tsx temp_scripts/verify-tabs.ts
import schema from '../src/globals/WeMeditateAppTranslations/translationsSchema.json'
import { buildTranslationTabs, type TranslationsSchema } from '../src/fields/translationsField'

const tabs = buildTranslationTabs(schema as unknown as TranslationsSchema, 'wm-app-translations')

let leaves = 0
let rows = 0
let richFields = 0
const problems: string[] = []

type AnyField = {
  type?: string
  name?: string
  label?: unknown
  fields?: AnyField[]
  tabs?: AnyTab[]
  admin?: { custom?: { schemaEntries?: { key: string; description: string; section?: string }[] } }
}
type AnyTab = { label?: unknown; description?: string; fields?: AnyField[] }

function checkLeaf(path: string, fields: AnyField[]) {
  leaves++
  const json = fields.find((f) => f.type === 'json')
  const rts = fields.filter((f) => f.type === 'richText')
  richFields += rts.length

  if (json) {
    const entries = json.admin?.custom?.schemaEntries ?? []
    rows += entries.length
    if (entries.length === 0) problems.push(`${path}: json field with no entries`)

    // description present on every row
    for (const e of entries) {
      if (!e.description || !e.description.trim())
        problems.push(`${path}.${e.key}: EMPTY description`)
    }

    // sections must be contiguous (a section must not reappear after another)
    const seen = new Set<string>()
    let prev: string | undefined
    const order: string[] = []
    for (const e of entries) {
      const s = e.section || ''
      if (s !== prev) {
        if (s && seen.has(s)) problems.push(`${path}: section "${s}" is not contiguous (reappears)`)
        seen.add(s)
        prev = s
        order.push(s || '(ungrouped)')
      }
    }
    const secList = order.join(' → ')
    console.log(`  ${path}  ${entries.length} rows${rts.length ? ` +${rts.length}¶` : ''}`)
    if (secList) console.log(`      ${secList}`)
  } else if (rts.length) {
    console.log(`  ${path}  (richText only, ${rts.length})`)
  } else {
    problems.push(`${path}: leaf produced no editable fields`)
  }

  for (const rt of rts) {
    if (!rt.label) problems.push(`${path}: richText ${rt.name} has no label`)
  }
}

for (const tab of tabs as unknown as AnyTab[]) {
  console.log(`\n▸ ${String(tab.label)}${tab.description ? `  — ${tab.description}` : ''}`)
  const group = (tab.fields ?? []).find((f) => f.type === 'group')
  const nested = group?.fields?.find((f) => f.type === 'tabs')
  if (nested?.tabs) {
    for (const sub of nested.tabs) checkLeaf(String(sub.label), sub.fields ?? [])
  } else {
    checkLeaf(String(tab.label), tab.fields ?? [])
  }
}

console.log(`\nleaves=${leaves} rows=${rows} richTextFields=${richFields}`)
if (problems.length) {
  console.log(`\n✗ ${problems.length} PROBLEM(S):`)
  for (const p of problems) console.log(`  - ${p}`)
  process.exit(1)
}
console.log(
  '✓ structure valid: sections contiguous, every row described, every leaf renders fields',
)
