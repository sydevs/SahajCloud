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
})
