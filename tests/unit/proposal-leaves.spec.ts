/**
 * The one derivation both anti-spam layers read (#948): which leaves of a
 * client-authored field patch owe a URL scan, which owe an address check, and
 * which the target collection's own config exempts.
 *
 * `screenProposalContent`'s verdicts are `tests/unit/submission-screening.spec.ts`
 * and the write guard's refusals are `tests/int/user-submissions-create.int.spec.ts`.
 * This file is the classification underneath both, so a case here is about the
 * split rather than about either caller's answer.
 */
import type { FlattenedField } from 'payload'

import { describe, expect, it } from 'vitest'

// The factory itself, not the `@/fields` barrel: the barrel pulls the schedule
// and translations fields into a lane that boots nothing.
import { urlField } from '@/fields/urlField'
import { MAX_LEAVES, proposalLeaves } from '@/lib/antiSpam/proposalLeaves'

/** A minimal stand-in for the shape `flattenedFields` hands the walk. */
const fields = (...declared: unknown[]) => declared as FlattenedField[]

const EVENTS = fields(
  { name: 'title', type: 'text' },
  { name: 'contactPhone', type: 'text' },
  { name: 'contactEmail', type: 'email' },
  urlField({ name: 'website' }),
  {
    name: 'address',
    type: 'group',
    flattenedFields: fields({ name: 'street', type: 'text' }, { name: 'mapLink', type: 'text' }),
  },
)

/**
 * Both real callers name the patch's own column, so every fixture here does
 * too — a bare path is a shape nothing posts.
 */
const leavesOf = (value: unknown, declared: FlattenedField[] = EVENTS) =>
  proposalLeaves(value, declared, 'proposed')

describe('proposalLeaves', () => {
  it('scans a free-text column the caller never named', () => {
    // The defect this exists for: `contactPhone` is proposable free text that
    // no hand-written path list carried, so a link in it was scanned by
    // neither layer.
    const leaves = leavesOf({ contactPhone: 'call 07700 or buy-now.example' })

    expect(leaves.urlScan).toEqual({ 'proposed.contactPhone': 'call 07700 or buy-now.example' })
  })

  it('names a nested leaf by its dotted path', () => {
    // `checkNoUrls` reads the top level only, so an unflattened patch would
    // wave a link in `address.street` through — and the key is what names the
    // offending column in the refusal a sender reads.
    const leaves = leavesOf({ address: { street: 'see cheap.shop' } })

    expect(leaves.urlScan).toEqual({ 'proposed.address.street': 'see cheap.shop' })
  })

  it('routes an email column to the address check instead of the URL scan', () => {
    const leaves = leavesOf({ contactEmail: 'host@example.org' })

    expect(leaves.emails).toEqual({ 'proposed.contactEmail': 'host@example.org' })
    expect(leaves.urlScan).toEqual({})
  })

  it('exempts a column declared to hold a link', () => {
    // `urlField` marks what it builds `custom.holdsUrl`, because a built URL
    // column is indistinguishable from free text.
    const leaves = leavesOf({ website: 'https://example.org/classes' })

    expect(leaves).toEqual({ urlScan: {}, emails: {}, truncated: false })
  })

  it('exempts a string value, never the key above it', () => {
    // Exempting the key hid every leaf beneath it: `website` here is an object,
    // so its own leaves are still free text somebody could hide a link in.
    const leaves = leavesOf({ website: { note: 'visit cheap.shop' } })

    expect(leaves.urlScan).toEqual({ 'proposed.website.note': 'visit cheap.shop' })
  })

  it('descends an unrecognised key into nothing, which exempts nothing', () => {
    // Resolving a dotted path instead reached a column the patch never nested
    // under, so a link under a made-up key inherited `website`'s exemption.
    const leaves = leavesOf({ title: { website: 'visit cheap.shop' } })

    expect(leaves.urlScan).toEqual({ 'proposed.title.website': 'visit cheap.shop' })
  })

  it('drops an empty value, which can trip neither check', () => {
    const leaves = leavesOf({ title: '   ', contactEmail: '' })

    expect(leaves).toEqual({ urlScan: {}, emails: {}, truncated: false })
  })

  it('keys a bare string under the prefix the caller named', () => {
    // A refusal has to name an input the sender posted, and a patch that is
    // itself a string has no key of its own to name.
    expect(leavesOf('buy-now.example').urlScan).toEqual({ proposed: 'buy-now.example' })
  })

  it('prefixes every nested leaf, so a refusal names a path the sender posted', () => {
    const leaves = leavesOf({ address: { street: 'see cheap.shop' } })

    expect(leaves.urlScan).toEqual({ 'proposed.address.street': 'see cheap.shop' })
  })

  /**
   * ⚠ The patch is public input. A walker with neither bound is a stack
   * overflow and an unbounded allocation waiting for somebody to post a deeply
   * nested object, and the write guard's own walk had neither until #948.
   */
  it('stops descending past its depth bound, and says it did', () => {
    const deep = (levels: number) =>
      Array.from({ length: levels }).reduce<unknown>((inner) => ({ nested: inner }), 'cheap.shop')

    expect(Object.keys(leavesOf(deep(5)).urlScan)).toHaveLength(1)
    expect(leavesOf(deep(5)).truncated) /* within the bound */
      .toBe(false)

    const cut = leavesOf(deep(60))
    expect(cut.urlScan).toEqual({})
    expect(cut.truncated).toBe(true)
  })

  /**
   * ⚠ The fail-open a single bounded walk re-arms, and the reason `truncated`
   * exists. The budget is spent on harmless text nodes before `title` is
   * reached, so the link in it is in neither bucket — and a caller reading only
   * the buckets gets a clean verdict on a patch nothing finished scanning.
   */
  it('reports truncation when a later key is never reached', () => {
    const leaves = leavesOf({
      description: Object.fromEntries(
        Array.from({ length: MAX_LEAVES + 10 }, (_, index) => [
          `node${index}`,
          `paragraph ${index}`,
        ]),
      ),
      title: 'join us at cheap.shop',
    })

    expect(Object.values(leaves.urlScan)).not.toContain('join us at cheap.shop')
    expect(leaves.truncated).toBe(true)
  })

  /**
   * ⚠ A dotted path is not unique, because a submitter chooses the keys. The
   * later write discarded the link outright before `place` suffixed collisions.
   */
  it('keeps both leaves when two keys compose the same path', () => {
    const leaves = leavesOf({
      address: { 'street.note': 'join us at cheap.shop', street: { note: 'ok' } },
    })

    expect(Object.values(leaves.urlScan)).toContain('join us at cheap.shop')
    expect(Object.values(leaves.urlScan)).toContain('ok')
  })

  /**
   * ⚠ What the bound is sized for. `description` is `richText`, so a patch for
   * it is a Lexical tree and the text nodes sit five levels down before any
   * formatting — below the 6 the screening job's walk used, which is why
   * adopting that number unchanged would have stopped scanning a column the
   * create-time path list did reach.
   */
  it('reaches the text node of a rich-text column', () => {
    const leaves = leavesOf({
      description: {
        root: {
          children: [
            {
              children: [
                { text: 'Every Tuesday. ' },
                { children: [{ text: 'buy at cheap.shop' }] },
              ],
            },
          ],
        },
      },
    })

    expect(Object.values(leaves.urlScan)).toContain('buy at cheap.shop')
  })

  /**
   * ⚠ The bound has to clear a real description, because tripping it is now a
   * refusal rather than a silent stop. Lexical banks about 11 string leaves per
   * formatted paragraph — its own `type`, `mode` and `direction` keys, not the
   * sender's prose — so the 200 this replaced turned an ordinary 20-paragraph
   * blurb into a 400 asking the sender to simplify.
   */
  it('scans a long formatted description without truncating, and still finds a link', () => {
    const text = (value: string, format = 0) => ({
      detail: 0,
      format,
      mode: 'normal',
      style: '',
      text: value,
      type: 'text',
      version: 1,
    })
    const paragraph = (...children: unknown[]) => ({
      children,
      direction: 'ltr',
      format: '',
      indent: 0,
      textFormat: 0,
      textStyle: '',
      type: 'paragraph',
      version: 1,
    })
    const body = Array.from({ length: 60 }, (_, index) =>
      paragraph(text(`Paragraph ${index}. `), text('Bold', 1), text(' and the rest of it.')),
    )

    const leaves = leavesOf({
      title: 'Thursday class in Hull',
      description: {
        root: {
          children: [...body, paragraph(text('join us at cheap.shop'))],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'root',
          version: 1,
        },
      },
    })

    expect(leaves.truncated).toBe(false)
    expect(Object.values(leaves.urlScan)).toContain('join us at cheap.shop')
  })

  it('stops collecting past its leaf bound, and says it did', () => {
    const wide = Object.fromEntries(
      Array.from({ length: MAX_LEAVES + 100 }, (_, index) => [`key${index}`, `value ${index}`]),
    )
    const leaves = leavesOf(wide)

    expect(Object.keys(leaves.urlScan).length).toBeLessThanOrEqual(MAX_LEAVES)
    expect(leaves.truncated).toBe(true)
  })

  it('counts both buckets against that bound', () => {
    // Addresses are collected now rather than skipped, so a patch of nothing
    // but email columns must not walk past the bound unmetered.
    const manyEmails = fields(
      ...Array.from({ length: MAX_LEAVES + 100 }, (_, index) => ({
        name: `email${index}`,
        type: 'email',
      })),
    )
    const patch = Object.fromEntries(
      Array.from({ length: MAX_LEAVES + 100 }, (_, index) => [
        `email${index}`,
        `host${index}@example.org`,
      ]),
    )

    expect(Object.keys(leavesOf(patch, manyEmails).emails).length).toBeLessThanOrEqual(MAX_LEAVES)
  })
})
