// Print the translations schema tree + seed keys, so IA authoring works against
// ground truth. Usage: node temp_scripts/inspect-schema.mjs [groupPath]
import { readFileSync } from 'node:fs'

const schema = JSON.parse(
  readFileSync('src/globals/WeMeditateAppTranslations/translationsSchema.json', 'utf8'),
)
const seed = JSON.parse(readFileSync('seeds/wm-app-translations/data.en.json', 'utf8'))

const isGroup = (n) => n && n.type === 'object'
const isLeafProp = (n) => n && (n.type === 'string' || n.type === 'richText')

function describeLeaf(name, group, indent) {
  const props = Object.entries(group.properties || {})
  const secs = new Set(props.map(([, p]) => p.section).filter(Boolean))
  console.log(
    `${indent}• ${name}  [${props.length} keys, ${secs.size} sections]${group.title ? `  title="${group.title}"` : ''}`,
  )
  for (const [k, p] of props) {
    const sec = p.section ? `  §${p.section}` : ''
    console.log(`${indent}    ${p.type === 'richText' ? '¶' : '·'} ${k}${sec}`)
  }
}

function walk(name, node, indent) {
  const props = Object.entries(node.properties || {})
  const subgroups = props.filter(([, p]) => isGroup(p))
  if (subgroups.length > 0) {
    console.log(
      `${indent}▸ ${name}  (tab with ${subgroups.length} sub-tabs)${node.title ? `  title="${node.title}"` : ''}`,
    )
    for (const [sn, sg] of subgroups) {
      if (Object.values(sg.properties || {}).some(isGroup)) walk(sn, sg, indent + '  ')
      else describeLeaf(sn, sg, indent + '  ')
    }
  } else {
    describeLeaf(name, node, indent)
  }
}

const only = process.argv[2]
console.log('=== SCHEMA TREE ===')
for (const [name, node] of Object.entries(schema.properties || {})) {
  if (only && name !== only) continue
  walk(name, node, '')
}

console.log('\n=== SEED top-level keys ===')
console.log(Object.keys(seed).join('\n'))
