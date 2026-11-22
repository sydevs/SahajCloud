/**
 * The three `docs/rules/admin-ui.md` rules a custom field component can break
 * silently, walked over the whole population rather than the components that
 * happened to be fixed (#1247).
 *
 * Every one of them was already written down, and every one was skipped anyway:
 * seven field components merged no `admin.width`, ten orphaned their label, and
 * three suppressed the focus ring. A component is the only place each rule can
 * be broken, and its own source is the only place that shows it — so this reads
 * sources, the shape `custom-cell-drawer-select-coverage.spec.ts` uses for the
 * cell convention.
 *
 * ⚠ **This measures text, not behaviour.** It cannot tell which element an
 * attribute sits on beyond the one opening tag it reads, so each rule is
 * written to fail on the *shape* the defect takes rather than on the defect
 * itself. `admin-field-markup.spec.ts` is the behavioural half for the two
 * fields it covers, where `label.control` is the browser's own resolution.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = resolve(__dirname, '../../src')
const ADMIN = join(SRC, 'components/admin')

/** Both shapes a registration takes: the bare path, and `{ path, serverProps }`. */
const REGISTRATION = /Field:\s*(?:'([^']+)'|\{[\s\S]{0,200}?path:\s*'([^']+)')/g

const RELATIVE_IMPORT = /from\s+'(\.[^']+)'/g

/** An opening tag, with its attributes, for any element. */
const OPENING_TAG = /<([A-Za-z][\w.]*)((?:[^<>'"{}]|'[^']*'|"[^"]*"|\{(?:[^{}]|\{[^{}]*\})*\})*)>/g

function sourceFiles(dir: string, extensions = /\.tsx?$/): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path, extensions)
    return extensions.test(entry.name) ? [path] : []
  })
}

/** `@/x` and `./x` alike, through the three spellings a module may take. */
function resolveModule(specifier: string, from: string): string | null {
  const base = specifier.startsWith('@/')
    ? join(SRC, specifier.slice(2))
    : resolve(from, '..', specifier)
  for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function registeredFields(): string[] {
  const found = new Set<string>()
  for (const file of sourceFiles(SRC)) {
    for (const match of readFileSync(file, 'utf8').matchAll(REGISTRATION)) {
      const resolved = resolveModule(match[1] ?? match[2], file)
      if (resolved) found.add(resolved)
    }
  }
  return [...found].sort()
}

/**
 * The module's own source, then the modules it reaches by relative import.
 * Transitive, not one hop: a registration naming a folder resolves to its
 * barrel, and a field that delegates its root to a child keeps the rule with
 * whichever of the two writes that root.
 */
function reaches(pattern: RegExp, module: string, seen = new Set<string>()): boolean {
  if (seen.has(module)) return false
  seen.add(module)

  const source = readFileSync(module, 'utf8')
  if (pattern.test(source)) return true

  for (const match of source.matchAll(RELATIVE_IMPORT)) {
    const sibling = resolveModule(match[1], module)
    if (sibling && reaches(pattern, sibling, seen)) return true
  }
  return false
}

const relative = (path: string) => path.slice(SRC.length + 1)

describe('every registered custom Field that builds a field-type root merges its field styles', () => {
  /**
   * The population is the registrations that build Payload's field markup. A
   * `ui` field rendering a banner, a button or a preview frame builds no
   * `field-type` root, so there is no root for a width to reach and the rule
   * does not apply to it.
   */
  const fields = registeredFields().filter((field) => reaches(/\bfield-type\b/, field))

  /** A scan finding nothing would make the assertion below pass by vacuum. */
  it('finds the registrations that build one', () => {
    expect(fields.length).toBeGreaterThan(15)
  })

  it('reaches mergeFieldStyles from each one', () => {
    // `admin.width` becomes `--field-width` only through the helper, and a
    // field that merges nothing is content-width while its siblings flex.
    const skipped = fields.filter((field) => !reaches(/\bmergeFieldStyles\(/, field))
    expect(skipped.map(relative)).toEqual([])
  })
})

describe('no FieldLabel is left resolving to a non-control', () => {
  /**
   * `FieldLabel` derives `htmlFor` from the path it is given, so a `path` is a
   * claim that some control on the page carries `field-<path>`. A composite
   * passes none: with no `htmlFor` it renders a `<span>`, which claims nothing,
   * and the control names itself with `aria-label`.
   *
   * The subject is the module that builds the `field-type` root, because that
   * is the markup a label resolves against — the claim can be made by a child
   * it renders, as the Regions join table's heading did. A standalone `Label:`
   * replacement on a built-in field is therefore not asked: its control is
   * inside Payload's own input, where Payload put the id.
   */
  const CLAIMS_A_CONTROL = /<FieldLabel\b[^>]*\b(?:path|htmlFor)=/

  /**
   * A module that writes Payload's field markup — `field-type`, in a class
   * string or in the array it joins — and whose own chain claims a control.
   */
  const claimants = sourceFiles(ADMIN)
    .map((path) => ({ path, source: readFileSync(path, 'utf8') }))
    .filter(({ source }) => /\bfield-type\b/.test(source))
    .filter(({ path }) => reaches(CLAIMS_A_CONTROL, path))

  it('finds the roots whose label claims a control', () => {
    expect(claimants.length).toBeGreaterThan(3)
  })

  /** The id, on an element that can take focus and hold a name. */
  const CONTROLS = new Set(['input', 'select', 'textarea', 'button'])

  function putsTheIdOnAControl(module: string, seen = new Set<string>()): boolean {
    if (seen.has(module)) return false
    seen.add(module)

    const source = readFileSync(module, 'utf8')
    for (const [, tag, attributes = ''] of source.matchAll(OPENING_TAG)) {
      // Payload's own wrappers take the id for their inner input by another
      // name: `inputId` on ReactSelect, `htmlFor` on a label pointing at a
      // control some other component renders.
      if (/\b(?:inputId|htmlFor)=\{fieldId\(/.test(attributes)) return true
      if (CONTROLS.has((tag ?? '').toLowerCase()) && /\bid=\{fieldId\(/.test(attributes))
        return true
    }

    for (const match of source.matchAll(RELATIVE_IMPORT)) {
      const sibling = resolveModule(match[1]!, module)
      if (sibling && putsTheIdOnAControl(sibling, seen)) return true
    }
    return false
  }

  it('puts that id on a control, never on the wrapper', () => {
    // Every one of these orphans put it on the `field-type` root instead, so
    // the label resolved to a `<div>`: the click focused nothing, and a screen
    // reader announced the control unnamed.
    const orphaned = claimants.filter(({ path }) => !putsTheIdOnAControl(path))
    expect(orphaned.map(({ path }) => relative(path))).toEqual([])
  })
})

describe('no admin module suppresses the focus ring without replacing it', () => {
  /**
   * Payload paints the ring from one global rule, `:focus-visible { outline:
   * var(--accessibility-outline) }` (`@payloadcms/ui/dist/scss/app.scss`), so
   * an `outline` of `none` or `0` on a keyboard-operable control removes the
   * only focus indicator it has.
   *
   * A replacement has to be a `:focus-visible` rule, which means it lives in a
   * stylesheet — so the suppression belongs there too, next to it. An inline
   * one cannot be conditioned on focus at all, and the `onFocus` handler that
   * stands in for it fires on a mouse click as well, which is the thing
   * `:focus-visible` exists to tell apart. That makes the two halves checkable
   * separately: no inline suppression anywhere, and no stylesheet suppressing
   * a ring it does not redraw under a focus selector.
   */
  const SUPPRESSION = /outline:\s*(?:'none'|"none"|none\b|0\b)/
  const FOCUS_SELECTOR = /:focus-visible\b|:focus-within\b|:focus\b/

  it('suppresses none of it inline, where no focus selector can reach', () => {
    const inline = sourceFiles(ADMIN)
      .map((path) => ({ path, source: readFileSync(path, 'utf8') }))
      .filter(({ source }) => SUPPRESSION.test(source))
    expect(inline.map(({ path }) => relative(path))).toEqual([])
  })

  it('redraws it under a focus selector in every sheet that suppresses it', () => {
    // The granularity is the file, not the declaration: this cannot tell that
    // the replacement covers the control that was suppressed. It fails the
    // shape the defect took — a suppression with no focus rule in the sheet.
    const sheets = sourceFiles(ADMIN, /\.(css|scss)$/)
      .map((path) => ({ path, source: readFileSync(path, 'utf8') }))
      .filter(({ source }) => SUPPRESSION.test(source) && !FOCUS_SELECTOR.test(source))
    expect(sheets.map(({ path }) => relative(path))).toEqual([])
  })
})
