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
import { proposalLeaves } from '@/lib/antiSpam/proposalLeaves'

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

describe('proposalLeaves', () => {
  it('scans a free-text column the caller never named', () => {
    // The defect this exists for: `contactPhone` is proposable free text that
    // no hand-written path list carried, so a link in it was scanned by
    // neither layer.
    const leaves = proposalLeaves({ contactPhone: 'call 07700 or buy-now.example' }, EVENTS)

    expect(leaves.urlScan).toEqual({ contactPhone: 'call 07700 or buy-now.example' })
  })

  it('names a nested leaf by its dotted path', () => {
    // `checkNoUrls` reads the top level only, so an unflattened patch would
    // wave a link in `address.street` through — and the key is what names the
    // offending column in the refusal a sender reads.
    const leaves = proposalLeaves({ address: { street: 'see cheap.shop' } }, EVENTS)

    expect(leaves.urlScan).toEqual({ 'address.street': 'see cheap.shop' })
  })

  it('routes an email column to the address check instead of the URL scan', () => {
    const leaves = proposalLeaves({ contactEmail: 'host@example.org' }, EVENTS)

    expect(leaves.emails).toEqual({ contactEmail: 'host@example.org' })
    expect(leaves.urlScan).toEqual({})
  })

  it('exempts a column declared to hold a link', () => {
    // `urlField` marks what it builds `custom.holdsUrl`, because a built URL
    // column is indistinguishable from free text.
    const leaves = proposalLeaves({ website: 'https://example.org/classes' }, EVENTS)

    expect(leaves).toEqual({ urlScan: {}, emails: {} })
  })

  it('exempts a string value, never the key above it', () => {
    // Exempting the key hid every leaf beneath it: `website` here is an object,
    // so its own leaves are still free text somebody could hide a link in.
    const leaves = proposalLeaves({ website: { note: 'visit cheap.shop' } }, EVENTS)

    expect(leaves.urlScan).toEqual({ 'website.note': 'visit cheap.shop' })
  })

  it('descends an unrecognised key into nothing, which exempts nothing', () => {
    // Resolving a dotted path instead reached a column the patch never nested
    // under, so a link under a made-up key inherited `website`'s exemption.
    const leaves = proposalLeaves({ title: { website: 'visit cheap.shop' } }, EVENTS)

    expect(leaves.urlScan).toEqual({ 'title.website': 'visit cheap.shop' })
  })

  it('drops an empty value, which can trip neither check', () => {
    const leaves = proposalLeaves({ title: '   ', contactEmail: '' }, EVENTS)

    expect(leaves).toEqual({ urlScan: {}, emails: {} })
  })

  it('keys a bare string under the prefix the caller named', () => {
    // The write guard names the column the sender posted; the screening job's
    // message is about the patch itself.
    expect(proposalLeaves('buy-now.example', EVENTS, 'proposed').urlScan).toEqual({
      proposed: 'buy-now.example',
    })
    expect(proposalLeaves('buy-now.example', EVENTS).urlScan).toEqual({
      proposed: 'buy-now.example',
    })
  })

  it('prefixes every nested leaf, so a refusal names a path the sender posted', () => {
    const leaves = proposalLeaves({ address: { street: 'see cheap.shop' } }, EVENTS, 'proposed')

    expect(leaves.urlScan).toEqual({ 'proposed.address.street': 'see cheap.shop' })
  })

  /**
   * ⚠ The patch is public input. A walker with neither bound is a stack
   * overflow and an unbounded allocation waiting for somebody to post a deeply
   * nested object, and the write guard's own walk had neither until #948.
   */
  it('stops descending past its depth bound', () => {
    const deep = (levels: number) =>
      Array.from({ length: levels }).reduce<unknown>((inner) => ({ nested: inner }), 'cheap.shop')

    expect(Object.keys(proposalLeaves(deep(5), EVENTS).urlScan)).toHaveLength(1)
    expect(proposalLeaves(deep(60), EVENTS).urlScan).toEqual({})
  })

  /**
   * ⚠ What the bound is sized for. `description` is `richText`, so a patch for
   * it is a Lexical tree and the text nodes sit five levels down before any
   * formatting — below the 6 the screening job's walk used, which is why
   * adopting that number unchanged would have stopped scanning a column the
   * create-time path list did reach.
   */
  it('reaches the text node of a rich-text column', () => {
    const leaves = proposalLeaves(
      {
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
      },
      EVENTS,
      'proposed',
    )

    expect(Object.values(leaves.urlScan)).toContain('buy at cheap.shop')
  })

  it('stops collecting past its leaf bound', () => {
    const wide = Object.fromEntries(
      Array.from({ length: 500 }, (_, index) => [`key${index}`, `value ${index}`]),
    )

    expect(Object.keys(proposalLeaves(wide, EVENTS).urlScan).length).toBeLessThanOrEqual(200)
  })

  it('counts both buckets against that bound', () => {
    // Addresses are collected now rather than skipped, so a patch of nothing
    // but email columns must not walk past the bound unmetered.
    const manyEmails = fields(
      ...Array.from({ length: 500 }, (_, index) => ({ name: `email${index}`, type: 'email' })),
    )
    const patch = Object.fromEntries(
      Array.from({ length: 500 }, (_, index) => [`email${index}`, `host${index}@example.org`]),
    )

    expect(Object.keys(proposalLeaves(patch, manyEmails).emails).length).toBeLessThanOrEqual(200)
  })
})
