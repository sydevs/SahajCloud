import type { PayloadRequest, Where } from 'payload'

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { memoizeOnRequest } from '@/lib/utilities/requestMemo'
import type { UserSubmission } from '@/payload-types'

import { countNote } from './countNote'
import { listPath } from './listPath'

/**
 * The intakes a Sahaj Atlas service sends, besides a registration.
 *
 * A registration is always the Atlas's — no other surface creates one — but a
 * contact message or a mailing-list sign-up can come from either product, and
 * these rows reach an Atlas admin's list. We Meditate's own failures wait for
 * their own home (#1119).
 *
 * ⚠ **Not `FORM_BACKED_TYPES`, which today holds the same pair.** That one
 * answers "must carry a `form`"; this one answers "a service sends it". They
 * part the day an intake carries a form and nothing to deliver, or the other
 * way round.
 */
const SHARED_INTAKES: UserSubmission['type'][] = ['contact', 'subscribe']

/** Every Sahaj Atlas service, whoever owns it. Memoized: two surfaces ask. */
function atlasClientIds(req: PayloadRequest): Promise<number[]> {
  return memoizeOnRequest(req, 'atlasOverview:atlasClientIds', async () => {
    const { docs } = await req.payload.find({
      collection: 'clients',
      where: { roles: { contains: 'sahaj-atlas-client' } },
      depth: 0,
      pagination: false,
      select: {},
      overrideAccess: true,
      req: localeIsolatedReq(req),
    })
    return docs.map((doc) => doc.id)
  })
}

/**
 * Rows whose decision was fine and whose delivery was not — a confirmation a
 * registrant never got, a message that never reached the inbox it was for.
 *
 * ⚠ **`failed` is nobody's job until someone is shown it.** It is not a
 * refusal, so it is absent from every spam surface, and it is not open for
 * review, so a reviewer never meets it either. Until #1121 the only way to find
 * one was to query the collection by hand.
 */
export async function failedDeliveriesWhere(req: PayloadRequest): Promise<Where> {
  const ids = await atlasClientIds(req)
  return {
    and: [
      { status: { equals: 'failed' } },
      {
        or: [
          { type: { equals: 'registration' } },
          { and: [{ type: { in: SHARED_INTAKES } }, { client: { in: ids } }] },
        ],
      },
    ],
  }
}

/** The admin list of those rows, as a path under the admin route. */
export async function failedDeliveriesPath(req: PayloadRequest): Promise<`/${string}`> {
  // `listPath` is what keeps the client-id list one comma-joined value — this
  // `where` names every Atlas service, and indexed keys would make the URL
  // kilobytes long.
  return listPath('user-submissions', (await failedDeliveriesWhere(req)).and as Where[])
}

/**
 * Deliveries still unsent, and the sentence the admin digest shows — `null`
 * when everything went out.
 *
 * No window, unlike the spam count: a failed send stays failed until somebody
 * sends it again, so an old one is no less undelivered than today's.
 */
export async function failedDeliveries(args: {
  overrideAccess: boolean
  req: PayloadRequest
}): Promise<null | { count: number; text: string }> {
  return countNote({
    ...args,
    where: await failedDeliveriesWhere(args.req),
    text: (count) =>
      `${count} message${count === 1 ? '' : 's'} could not be delivered and can be sent again`,
  })
}
