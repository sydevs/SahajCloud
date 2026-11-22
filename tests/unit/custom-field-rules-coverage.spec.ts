/**
 * The three `docs/rules/admin-ui.md` rules a custom field component can break
 * silently — the width merge, the id's home, and the focus ring — walked over
 * the whole population rather than the components that happened to be fixed
 * (#1247). The fourth, a control built out of a `<div onClick>`, is eslint's:
 * `jsx-a11y/no-static-element-interactions` reports at the line, and covers
 * the frontend this walk does not reach.
 *
 * ⚠ **This measures text, not behaviour.** It cannot tell which element an
 * attribute sits on beyond the one opening tag it reads, so each rule is
 * written to fail on the *shape* the defect takes rather than on the defect
 * itself. `admin-field-markup.spec.ts` is the behavioural half for the two
 * fields it covers, where `label.control` is the browser's own resolution.
 */
import { readFileSync } from 'node:fs'
import { join, relative as relativeTo } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  reaches,
  registeredComponents,
  resolveSpec,
  SRC,
  sourceFiles,
} from '../utils/adminRegistrations'

const ADMIN = join(SRC, 'components/admin')

const relative = (path: string) => relativeTo(SRC, path)

/** A declaration, never a comment: the rule forbids the one, not talk of it. */
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '')

const fields = registeredComponents('Field')

describe('every registered custom Field that builds a field-type root merges its field styles', () => {
  /**
   * The population is the registrations that build Payload's field markup. A
   * `ui` field rendering a banner, a button or a preview frame builds no
   * `field-type` root, so there is no root for a width to reach.
   */
  const rooted = fields.resolved.filter((field) => reaches(/\bfield-type\b/, field))

  it('resolves every registration it found', () => {
    // A specifier that resolves nowhere would leave the population silently,
    // and still satisfy any floor placed under its size.
    expect(fields.unresolved).toEqual([])
  })

  /** A scan finding nothing would make the assertion below pass by vacuum. */
  it('finds the registrations that build one', () => {
    expect(rooted.length).toBeGreaterThan(15)
  })

  it('reaches mergeFieldStyles from each one', () => {
    // `admin.width` becomes `--field-width` only through the helper, and a
    // field that merges nothing is content-width while its siblings flex.
    const skipped = rooted.filter((field) => !reaches(/\bmergeFieldStyles\(/, field))
    expect(skipped.map(relative)).toEqual([])
  })
})

describe('no FieldLabel is left resolving to a non-control', () => {
  /**
   * A `path` or an `htmlFor` on `FieldLabel` is a claim that some control
   * carries that id. The subject is the module that builds the `field-type`
   * root, because that is the markup a label resolves against — the claim can
   * be made by a child it renders, as the Regions join table's heading did. A
   * standalone `Label:` replacement on a built-in field is therefore not
   * asked: its control is inside Payload's own input.
   */
  const CLAIMS_A_CONTROL = /<FieldLabel\b[^>]*\b(?:path|htmlFor)=/

  /**
   * The id, on something that is a control. Three shapes reach one:
   * the attribute on a focusable element; `inputId`, which `ReactSelect`
   * forwards to react-select's own input; and Payload's `TextInput`, which
   * spells `field-<path>` onto its input itself (`dist/fields/Text/Input.js`).
   *
   * ⚠ **`htmlFor` is not one of them.** It is the claim being checked, so
   * accepting it here would let every claimant satisfy the rule by restating
   * it — which is what this regex did until the proof run caught it.
   */
  const ID_ON_A_CONTROL =
    /<(?:input|select|textarea|button)\b[^>]*\bid=\{fieldId\(|\binputId=\{fieldId\(|<TextInput\b/

  const roots = sourceFiles(ADMIN, /\.tsx$/).filter((path) =>
    /\bfield-type\b/.test(readFileSync(path, 'utf8')),
  )

  const claimants = roots.filter((path) => reaches(CLAIMS_A_CONTROL, path))

  it('finds the roots whose label claims a control', () => {
    expect(claimants.length).toBeGreaterThan(3)
  })

  it('puts that id on a control, never on the wrapper', () => {
    // Every one of these orphans put it on the `field-type` root instead, so
    // the label resolved to a `<div>`.
    const orphaned = claimants.filter((path) => !reaches(ID_ON_A_CONTROL, path))
    expect(orphaned.map(relative)).toEqual([])
  })

  /**
   * ⚠ **This check holds one direction only**, and `tests/AGENTS.md` asks
   * which: a label that claims a control must have one. The converse — a
   * composite that claims nothing must name its control with `aria-label` — is
   * not asserted, because most of this population is a read-only panel marked
   * up as a field, which has no control to name and whose label text is the
   * whole of its accessible name. An `aria-label` check over those would be
   * thirteen exemptions and one finding, so the finding (AddressSearchField)
   * is fixed in the diff and the direction is stated here instead.
   */
})

describe('no admin module suppresses the focus ring without replacing it', () => {
  /**
   * Payload paints it from one global rule, `:focus-visible { outline:
   * var(--accessibility-outline) }` (`@payloadcms/ui/dist/scss/app.scss`), so
   * an `outline` of `none` or `0` on a keyboard-operable control removes the
   * only focus indicator it has.
   *
   * A replacement is a rule in a stylesheet, so the suppression belongs there
   * too, beside it. An inline one cannot be conditioned on focus at all, and
   * the `onFocus` handler that stands in for it fires on a mouse click as
   * well — the thing `:focus-visible` exists to tell apart. So the two halves
   * check separately: no inline suppression anywhere, and no stylesheet
   * suppressing a ring it does not redraw under a focus selector.
   *
   * `:focus` and `:focus-within` count as a redraw. A text-entry control
   * answers focus however it was reached, as Payload's own `formInput` does
   * with a border colour; it is a *button* that owes the narrower selector.
   */
  const SUPPRESSION = /outline:\s*(?:'none'|"none"|none\b|0\b)/
  const FOCUS_SELECTOR = /:focus-visible\b|:focus-within\b|:focus\b/

  it('suppresses none of it inline, where no focus selector can reach', () => {
    const inline = sourceFiles(ADMIN).filter((path) =>
      SUPPRESSION.test(withoutComments(readFileSync(path, 'utf8'))),
    )
    expect(inline.map(relative)).toEqual([])
  })

  it('redraws it under a focus selector in every sheet that suppresses it', () => {
    // The granularity is the file, not the declaration: this cannot tell that
    // the replacement covers the control that was suppressed. It fails the
    // shape the defect took — a suppression with no focus rule in the sheet.
    const sheets = sourceFiles(ADMIN, /\.(css|scss)$/)
      .map((path) => ({ path, source: withoutComments(readFileSync(path, 'utf8')) }))
      .filter(({ source }) => SUPPRESSION.test(source) && !FOCUS_SELECTOR.test(source))
    expect(sheets.map(({ path }) => relative(path))).toEqual([])
  })
})

describe('the shared registration walk', () => {
  it('resolves a folder barrel, a bare file, and an export suffix alike', () => {
    // The three spellings a registration takes. An earlier resolver dropped
    // the first and the third, taking their components out of every rule above.
    const from = join(SRC, 'collections/Regions/Regions.ts')
    expect(resolveSpec('@/components/admin/RegionEvents', from)).toBe(
      join(ADMIN, 'RegionEvents/index.tsx'),
    )
    expect(resolveSpec('@/components/admin/TimestampInput', from)).toBe(
      join(ADMIN, 'TimestampInput.tsx'),
    )
    expect(resolveSpec('@/components/admin/TranscriptPanel#FileTranscriptField', from)).toBe(
      join(ADMIN, 'TranscriptPanel/index.ts'),
    )
  })
})
