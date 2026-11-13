/**
 * Every Payload name `custom.scss` reaches for is a name Payload still ships.
 *
 * The sheet is unlayered, so a selector that stops matching stops silently:
 * the rule never applies and the page still renders. A class renamed or a
 * variable dropped in a Payload upgrade surfaces only when someone tabs to a
 * link, or opens the one screen the rule was for — and four `:root` overrides
 * had already outlived the variables they were written against.
 *
 * So the sheet may only name what Payload's own stylesheet names. A class
 * Payload renders but never styles is unpinnable, and is matched by position
 * instead (`docs/rules/admin-ui.md`).
 *
 * Source text, like `lib-boundary.spec.ts`: the rule is about which names the
 * sheet spells, so there is nothing to run.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const SHEET = join(ROOT, 'src/app/(payload)/custom.scss')
const COMPONENTS = join(ROOT, 'src/components')
const PAYLOAD_SCSS = join(ROOT, 'node_modules/@payloadcms/ui/dist/scss')

/** Classes this repo's own components render. Everything else is Payload's. */
const OUR_CLASSES = [
  'address-search',
  'address-search__toggle',
  'notification-preferences',
  'string-select',
]

/**
 * Both packages' component CSS, plus the theming source beside it. The
 * variables are declared only in that source — `styles.css` carries none of
 * them — and the document tabs are styled only in `@payloadcms/next`.
 */
function payloadStyleFiles(): string[] {
  return [
    join(ROOT, 'node_modules/@payloadcms/ui/dist/styles.css'),
    join(ROOT, 'node_modules/@payloadcms/next/dist/prod/styles.css'),
    ...readdirSync(PAYLOAD_SCSS)
      .filter((name) => name.endsWith('.scss'))
      .map((name) => join(PAYLOAD_SCSS, name)),
  ]
}

function componentSources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) componentSources(full, found)
    else if (/\.tsx?$/.test(entry)) found.push(full)
  }
  return found
}

const sheet = readFileSync(SHEET, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const styleFiles = payloadStyleFiles()
const missing = styleFiles.filter((file) => !existsSync(file))
const styles = styleFiles
  .filter((file) => existsSync(file))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n')

const classes = [...new Set([...sheet.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(([, name]) => name))]
const variables = [
  ...new Set(
    [
      ...sheet.matchAll(/var\(\s*(--[a-zA-Z][\w-]*)/g),
      ...sheet.matchAll(/^\s*(--[a-zA-Z][\w-]*)\s*:/gm),
    ].map(([, name]) => name),
  ),
]

describe('custom.scss', () => {
  /** A corpus that moved would pass every case below while checking nothing. */
  it('reads Payload’s shipped stylesheets', () => {
    expect(missing).toEqual([])
    expect(styles.length).toBeGreaterThan(100_000)
    expect(classes.length).toBeGreaterThanOrEqual(20)
    expect(variables.length).toBeGreaterThanOrEqual(20)
  })

  it('names only classes Payload still styles', () => {
    const unknown = classes.filter(
      (name) => !OUR_CLASSES.includes(name) && !styles.includes(`.${name}`),
    )
    expect(unknown).toEqual([])
  })

  it('reads and overrides only variables Payload still declares', () => {
    const unknown = variables.filter((name) => !styles.includes(`${name}:`))
    expect(unknown).toEqual([])
  })

  it('claims as its own only classes this repo renders, and still uses each', () => {
    const sources = componentSources(COMPONENTS).map((file) => readFileSync(file, 'utf8'))
    const unrendered = OUR_CLASSES.filter((name) => !sources.some((src) => src.includes(name)))
    expect(unrendered).toEqual([])
    expect(OUR_CLASSES.filter((name) => !classes.includes(name))).toEqual([])
  })
})
