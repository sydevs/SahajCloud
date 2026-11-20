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
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const SHEET = join(ROOT, 'src/app/(payload)/custom.scss')
const COMPONENTS = join(ROOT, 'src/components')
/** Where an `admin.className` is declared, which renders a class as surely as a component. */
const CONFIGS = [join(ROOT, 'src/collections'), join(ROOT, 'src/fields'), join(ROOT, 'src/globals')]
const PAYLOAD_SCSS = join(ROOT, 'node_modules/@payloadcms/ui/dist/scss')
const PAYLOAD_VARS = join(PAYLOAD_SCSS, 'vars.scss')
const PAYLOAD_APP = join(PAYLOAD_SCSS, 'app.scss')

/** Variables this repo declares for itself, rather than overriding Payload's. */
const OUR_VARIABLES = ['--admin-body-size', '--need-help-width']

/**
 * Classes this repo renders itself — from a component, or from an
 * `admin.className` on a field config. Everything else is Payload's.
 */
const OUR_CLASSES = [
  'address-search',
  'address-search__toggle',
  'need-help',
  'notification-preferences',
  'string-select',
  'sy-checkbox-group',
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

/** Prose is not a declaration, and these rules are about declarations. */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '')
}

function componentFiles(dir: string, pattern: RegExp, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) componentFiles(full, pattern, found)
    else if (pattern.test(entry)) found.push(full)
  }
  return found
}

const sheet = withoutComments(readFileSync(SHEET, 'utf8'))
const adminFiles = componentFiles(COMPONENTS, /\.(tsx?|s?css)$/)
const adminSources = [
  ...componentFiles(COMPONENTS, /\.tsx?$/),
  ...CONFIGS.flatMap((dir) => componentFiles(dir, /\.tsx?$/)),
]
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
    const unknown = variables.filter(
      (name) => !OUR_VARIABLES.includes(name) && !styles.includes(`${name}:`),
    )
    expect(unknown).toEqual([])
  })

  /**
   * A dropped font-size declaration renders at the inherited size, so both
   * halves of this fix fail silently and both are pinned here. Why Payload's
   * own variable cannot carry it: `docs/rules/admin-ui.md` § Styling (#1144).
   */
  it('sizes admin text from its own length token, never Payload’s number', () => {
    const files = [SHEET, ...adminFiles]
    expect(files.length).toBeGreaterThan(40)

    const sized = files.map(
      (file) => [relative(ROOT, file), withoutComments(readFileSync(file, 'utf8'))] as const,
    )
    expect(sheet).toMatch(/--admin-body-size:\s*\d+(\.\d+)?px/)

    const payloads = sized.filter(([, text]) => text.includes('--base-body-size'))
    expect(payloads.map(([file]) => file)).toEqual([])

    const byLength = sized.filter(([, text]) =>
      /var\(\s*--admin-body-size\s*\)\s*\*\s*[\d.]+px/.test(text),
    )
    expect(byLength.map(([file]) => file)).toEqual([])
  })

  /**
   * The sheet flattens `--gutter-h`, which Payload declares at three widths, so
   * it restates the narrowest one. Both halves come from Payload's own source:
   * a breakpoint it moves, or a gutter it retunes, must red this rather than
   * leave a phone on a desktop gutter.
   */
  it('restates Payload’s narrow gutter at Payload’s own breakpoint', () => {
    const vars = readFileSync(PAYLOAD_VARS, 'utf8')
    const app = readFileSync(PAYLOAD_APP, 'utf8')

    const breakpoint = /\$breakpoint-s-width:\s*(\d+)px/.exec(vars)?.[1]
    const baseline = /\$baseline-px:\s*(\d+)px/.exec(vars)?.[1]
    const multiplier = /@include small-break \{[\s\S]*?--gutter-h:\s*#\{base\(([\d.]+)\)\}/.exec(
      app,
    )?.[1]

    // A parse that stopped matching would pass every assertion below.
    expect({ baseline, breakpoint, multiplier }).toEqual({
      baseline: '20',
      breakpoint: '768',
      multiplier: '0.8',
    })

    const gutter = Number(baseline) * Number(multiplier)
    expect(sheet).toContain(`@media (max-width: ${breakpoint}px)`)
    expect(sheet.slice(sheet.indexOf(`@media (max-width: ${breakpoint}px)`))).toContain(
      `--gutter-h: ${gutter}px`,
    )
  })

  it('claims as its own only classes this repo renders, and still uses each', () => {
    // A class named only in a stylesheet is not a class this repo renders, so a
    // component or a field config has to spell it.
    const sources = adminSources.map((file) => readFileSync(file, 'utf8'))
    const unrendered = OUR_CLASSES.filter((name) => !sources.some((src) => src.includes(name)))
    expect(unrendered).toEqual([])
    expect(OUR_CLASSES.filter((name) => !classes.includes(name))).toEqual([])
  })
})
