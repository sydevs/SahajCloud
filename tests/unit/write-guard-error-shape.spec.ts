import type { PayloadRequest } from 'payload'

import { describe, expect, it } from 'vitest'

import { writeGuardBeforeValidate } from '@/plugins/writeGuard/writeGuardPlugin'

/**
 * One endpoint, one error shape. `prepareUserSubmission` refuses the answer
 * pairs no policy path can scan selectively, and raises the same codes as the
 * guard — so a client reading `errors[0].data` must not have to know which of
 * the two refused it. The guard composed the offending field and then dropped
 * it on the way out, which neither a type error nor any other spec could see.
 */
describe('the write guard’s refusal', () => {
  const clientReq = { headers: new Headers(), user: { collection: 'clients' } } as PayloadRequest

  const refusalFor = async (data: Record<string, unknown>) => {
    // `proposed` is scanned by group, as the real policy scans it, so the
    // offending leaf is not the path the policy named.
    const hook = writeGuardBeforeValidate({
      create: { urlScanFields: ['proposed'], emailFields: ['senderEmail'] },
    })
    try {
      await hook({ collection: {}, data, operation: 'create', req: clientReq } as never)
    } catch (error) {
      return error as { data?: { code?: string; field?: string } }
    }
    throw new Error('the guard accepted the write')
  }

  it('names the offending field on a URL refusal', async () => {
    const error = await refusalFor({
      proposed: { title: 'Thursday class', description: 'see https://spam.example' },
    })

    expect(error.data?.code).toBe('urls_not_allowed')
    // The path the policy named, not the `#1` leaf key the group walk scanned
    // it under — which is a position in a private walk, not an input a client
    // can act on.
    expect(error.data?.field).toBe('proposed')
  })

  it('names the offending field on an address refusal', async () => {
    const error = await refusalFor({ senderEmail: 'not-an-address' })

    expect(error.data?.code).toBe('invalid_email')
    expect(error.data?.field).toBe('senderEmail')
  })

  /**
   * ⚠ A `derivedScan` is the ONLY create-time scan of its column, so a verdict
   * it could not reach must refuse (#948). Both ways in are fail-open
   * otherwise: a target collection whose config is absent derives no
   * exemptions and would scan nothing, and a patch that tripped a bound was
   * scanned only as far as the bound.
   */
  describe('a derived scan it could not finish', () => {
    const derivedRefusalFor = async (data: Record<string, unknown>, req = clientReq) => {
      const hook = writeGuardBeforeValidate({
        create: { derivedScan: { path: 'proposed', collection: 'events' } },
      })
      try {
        await hook({ collection: {}, data, operation: 'create', req } as never)
      } catch (error) {
        return error as { data?: { code?: string; field?: string }; status?: number }
      }
      return null
    }

    /** A `req` whose Events config the guard can read, so only the bound bites. */
    const configuredReq = {
      headers: new Headers(),
      user: { collection: 'clients' },
      payload: {
        collections: { events: { config: { flattenedFields: [{ name: 'title', type: 'text' }] } } },
      },
    } as unknown as PayloadRequest

    it('refuses when the target collection has no config to derive from', async () => {
      const error = await derivedRefusalFor({ proposed: { title: 'Thursday class' } })

      expect(error?.data?.code).toBe('content_unscannable')
      expect(error?.data?.field).toBe('proposed')
    })

    it('refuses a patch a bound stopped it scanning', async () => {
      const error = await derivedRefusalFor(
        {
          proposed: Object.fromEntries(
            Array.from({ length: 260 }, (_, index) => [`key${index}`, `value ${index}`]),
          ),
        },
        configuredReq,
      )

      expect(error?.data?.code).toBe('content_unscannable')
    })

    it('accepts a patch it scanned to the end', async () => {
      expect(await derivedRefusalFor({ proposed: { title: 'Thursday class' } }, configuredReq)).toBe(
        null,
      )
    })

    it('scans nothing, and refuses nothing, when the column is absent', async () => {
      // A contact or registration row carries no patch, and must not need the
      // target collection's config to be created.
      expect(await derivedRefusalFor({ senderEmail: 'visitor@example.org' })).toBe(null)
    })
  })
})
