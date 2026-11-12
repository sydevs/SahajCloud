import type { Payload, PayloadRequest } from 'payload'

import { describe, expect, it, vi } from 'vitest'

import { syncCommunityFeedback } from '@/collections/UserSubmissions/hooks/eventFeedback'
import {
  RESEND_FROM,
  SUBMISSION_MACHINE,
  type SubmissionActor,
} from '@/collections/UserSubmissions/machine'
import { SUBMISSION_STATUSES } from '@/collections/UserSubmissions/statuses'
import { EVENT_MACHINE } from '@/lib/eventVerification/machine'
import {
  LADDER,
  STAGES,
  VERIFICATION_STAGES,
  type VerificationStage,
} from '@/lib/eventVerification/stages'
import { declaredActor, withActor } from '@/lib/stateMachine/actor'
import { judgeTransition } from '@/lib/stateMachine/guard'
import { ANY_STATE, can, defineStateMachine } from '@/lib/stateMachine/machine'
import { transition } from '@/lib/stateMachine/transition'
import type { UserSubmission } from '@/payload-types'

/**
 * The lifecycle table, its lookup and its claim (#1121).
 *
 * The table-shaped cases below are deliberately about *derivation*: the
 * ladder's moves and the overdue sets are computed from `STAGES`, so a case
 * that re-lists them would only pin a second copy of what it is checking.
 * Each asserts the derivation's consequence instead.
 */
/** Every state `by` may reach from `from` — the whole set, not one membership. */
const reachable = <S extends string, A extends string>(
  machine: Parameters<typeof can<S, A>>[0],
  states: readonly S[],
  from: S,
  by: A,
): S[] => states.filter((to) => can(machine, from, to, by))

describe('can', () => {
  const machine = {
    name: 'test state',
    field: 'state',
    moves: [
      { from: ['a'], to: 'b', by: ['one'] },
      { from: ANY_STATE, to: 'z', by: ['one', 'two'] },
    ],
  } as const

  it('matches a listed move for its own actor only', () => {
    expect(can(machine, 'a', 'b', 'one')).toBe(true)
    expect(can(machine, 'a', 'b', 'two')).toBe(false)
    expect(can(machine, 'b', 'b', 'one')).toBe(false)
  })

  it('lets a wildcard move start anywhere', () => {
    expect(can(machine, 'b', 'z', 'two')).toBe(true)
    expect(reachable(machine, ['a', 'b', 'z'], 'a', 'one')).toEqual(['b', 'z'])
    expect(reachable(machine, ['a', 'b', 'z'], 'b', 'two')).toEqual(['z'])
  })
})

describe('judgeTransition', () => {
  const machine = defineStateMachine<'a' | 'b' | 'c', 'job' | 'boss' | 'staff', { kind: string }>({
    name: 'test state',
    field: 'state',
    states: ['a', 'b', 'c'],
    declarable: ['job'],
    person: (req) => (req.user ? ((req.user as { role?: 'boss' | 'staff' }).role ?? null) : null),
    moves: [
      { from: ['a'], to: 'b', by: ['job'] },
      {
        name: 'promote',
        from: ['a'],
        to: 'c',
        by: ['staff', 'boss'],
        when: ({ doc }) => doc.kind === 'open' || { field: 'kind', message: 'Open it first.' },
      },
      { name: 'demote', from: ['c'], to: 'a', by: ['boss'], refusal: 'Only a boss can demote.' },
    ],
  })

  const as = (role?: 'boss' | 'staff', declared?: string) =>
    ({
      user: role ? { role } : null,
      context: declared ? withActor({}, machine, declared as 'job') : {},
    }) as unknown as PayloadRequest
  const judge = (
    from: 'a' | 'b' | 'c',
    to: 'a' | 'b' | 'c' | null | undefined,
    req: PayloadRequest,
    kind = 'open',
  ) => judgeTransition({ machine, from, to, doc: { kind }, req })

  it('judges nothing when the write left the column alone', () => {
    expect(judge('a', undefined, as())).toEqual({ kind: 'unchanged' })
    expect(judge('a', 'a', as())).toEqual({ kind: 'unchanged' })
  })

  it('refuses a move that names no writer, and reports it', () => {
    expect(judge('a', 'b', as())).toMatchObject({
      kind: 'refused',
      message: expect.stringContaining('names no writer'),
      incident: true,
    })
  })

  it('lets a declared system writer make its own move, whoever the request is', () => {
    expect(judge('a', 'b', as('staff', 'job'))).toMatchObject({ kind: 'allowed', by: 'job' })
  })

  it('never lets a write claim to be a person', () => {
    // `boss` is in the table but not declarable: the claim is ignored, and the
    // request's own person answers.
    expect(judge('c', 'a', as('staff', 'boss'))).toMatchObject({
      kind: 'refused',
      by: 'staff',
    })
  })

  it('names the move a person made, once its condition holds', () => {
    expect(judge('a', 'c', as('staff'))).toMatchObject({
      kind: 'allowed',
      move: { name: 'promote' },
    })
  })

  it('reports a failed precondition on its own field, and not as an incident', () => {
    expect(judge('a', 'c', as('staff'), 'closed')).toMatchObject({
      kind: 'refused',
      field: 'kind',
      message: 'Open it first.',
      incident: false,
    })
  })

  it('tells a person which authority they lack', () => {
    expect(judge('c', 'a', as('staff'))).toMatchObject({
      kind: 'refused',
      field: 'state',
      message: 'Only a boss can demote.',
      incident: true,
    })
  })

  it('refuses a move the table does not hold, and an explicit null', () => {
    expect(judge('b', 'a', as('boss'))).toMatchObject({
      kind: 'refused',
      message: expect.stringContaining('cannot move test state from b to a'),
    })
    expect(judge('a', null, as('boss'))).toMatchObject({ kind: 'refused' })
  })
})

/**
 * What a person may do to a submission, judged as the column's guard judges a
 * form's post. Each row is one decision the review buttons rely on, or one
 * refusal a forged `PATCH` meets.
 */
describe('SUBMISSION_MACHINE, for a person', () => {
  type Status = UserSubmission['status']
  type Type = UserSubmission['type']

  const admin = { collection: 'managers', type: 'admin' }
  const reviewer = {
    collection: 'managers',
    type: 'manager',
    roles: { en: ['atlas-event-manager'] },
  }
  const noGrant = { collection: 'managers', type: 'manager', roles: { en: ['meditations-editor'] } }
  const req = (user: object) => ({ user, locale: 'en', context: {} }) as unknown as PayloadRequest

  const judge = (user: object, from: Status, to: Status, type: Type, extra = {}) =>
    judgeTransition({
      machine: SUBMISSION_MACHINE,
      from,
      to,
      doc: { type, region: 7, ...extra },
      req: req(user),
    })
  const decision = (user: object, from: Status, to: Status, type: Type) => {
    const verdict = judge(user, from, to, type)
    return verdict.kind === 'allowed' ? verdict.move.name : verdict.kind
  }

  it.each([
    ['pending', 'accepted', 'proposal', 'accept'],
    ['failed', 'accepted', 'proposal', 'accept'],
    ['pending', 'rejected', 'proposal', 'reject'],
    ['rejected', 'pending', 'proposal', 'reopen'],
    ['spam', 'pending', 'proposal', 'reopen'],
  ] as const)('lets a reviewer move a %s %s %s: %s', (from, to, type, name) => {
    expect(decision(reviewer, from, to, type)).toBe(name)
    expect(decision(admin, from, to, type)).toBe(name)
  })

  it.each([
    ['spam', 'confirmed_spam', 'registration', 'confirm-spam'],
    ['spam', 'confirmed_spam', 'proposal', 'confirm-spam'],
    ['confirmed_spam', 'pending', 'proposal', 'reopen'],
    ['spam', 'pending', 'contact', 'reopen'],
    ['failed', 'pending', 'contact', 'resend'],
  ] as const)('leaves %s → %s on a %s to an admin: %s', (from, to, type, name) => {
    expect(decision(admin, from, to, type)).toBe(name)
    expect(judge(reviewer, from, to, type)).toMatchObject({
      kind: 'refused',
      message: expect.stringMatching(/^Only an admin/),
    })
  })

  it('refuses every review move on an intake nobody reviews', () => {
    expect(judge(admin, 'pending', 'accepted', 'contact')).toMatchObject({
      kind: 'refused',
      message: 'A contact submission is not reviewable.',
    })
  })

  it('keeps a failed proposal open for review rather than resending it', () => {
    expect(judge(admin, 'failed', 'pending', 'proposal')).toMatchObject({ kind: 'refused' })
  })

  it('refuses reopening an accepted row, which already wrote to an event', () => {
    expect(judge(admin, 'accepted', 'pending', 'proposal')).toMatchObject({
      kind: 'refused',
      message: 'A accepted submission cannot become pending.',
    })
  })

  it('refuses a manager holding no grant, whatever the move', () => {
    expect(judge(noGrant, 'pending', 'rejected', 'proposal')).toMatchObject({
      kind: 'refused',
      message: 'You do not have permission to review submissions.',
    })
  })

  it('refuses a new-event accept with no region, on the region field', () => {
    expect(judge(reviewer, 'pending', 'accepted', 'proposal', { region: null })).toMatchObject({
      kind: 'refused',
      field: 'region',
      incident: false,
    })
    // An update proposal names its event, which needs no region.
    expect(
      judge(reviewer, 'pending', 'accepted', 'proposal', { region: null, event: 9 }),
    ).toMatchObject({ kind: 'allowed', move: { name: 'accept' } })
  })
})

describe('EVENT_MACHINE', () => {
  it('gives the job the ladder its own stage config describes', () => {
    for (const stage of LADDER) {
      const action = STAGES[stage].onDue
      if (action.kind !== 'remind') continue
      expect(can(EVENT_MACHINE, stage, action.nextStage, 'job:expireEvents')).toBe(true)
      // Nobody else walks the ladder: an advance is the job's alone.
      expect(can(EVENT_MACHINE, stage, action.nextStage, 'hook:save')).toBe(false)
    }
  })

  it('lets the job finish a class from wherever it stood', () => {
    for (const stage of VERIFICATION_STAGES) {
      if (stage === 'finished') continue
      expect(can(EVENT_MACHINE, stage, 'finished', 'job:expireEvents')).toBe(true)
    }
  })

  it('refuses a verify on a finished class, and allows it everywhere else', () => {
    expect(can(EVENT_MACHINE, 'finished', 'verified', 'verify')).toBe(false)
    for (const stage of VERIFICATION_STAGES) {
      if (stage === 'finished') continue
      expect(can(EVENT_MACHINE, stage, 'verified', 'verify')).toBe(true)
    }
  })

  it('adopts from the two pre-adoption stages and nowhere else', () => {
    const adopts = (from: VerificationStage) =>
      reachable(EVENT_MACHINE, VERIFICATION_STAGES, from, 'adoption')
    expect(adopts('unverified')).toEqual(['verified'])
    expect(adopts('denied')).toEqual(['verified'])
    expect(adopts('expired')).toEqual([])
  })

  it('lets the community deny only a listing it can still see', () => {
    const denies = (from: VerificationStage) =>
      reachable(EVENT_MACHINE, VERIFICATION_STAGES, from, 'community')
    expect(denies('unverified')).toEqual(['denied'])
    expect(denies('verified')).toEqual([])
  })

  // `import` is declarable in both tables, and one request writes both
  // collections, so a shared context key would hand a submission's importer
  // every event-stage move on the same request.
  it('does not read an actor another machine declared on the same request', () => {
    const req = {
      user: null,
      context: withActor(undefined, SUBMISSION_MACHINE, 'import'),
    } as unknown as PayloadRequest

    expect(declaredActor(req.context, SUBMISSION_MACHINE)).toBe('import')
    expect(declaredActor(req.context, EVENT_MACHINE)).toBeUndefined()
    expect(
      judgeTransition({
        machine: EVENT_MACHINE,
        from: 'verified',
        to: 'expired',
        doc: {},
        req,
      }),
    ).toMatchObject({ kind: 'refused', by: null })
  })
})

describe('SUBMISSION_MACHINE', () => {
  it('keeps every system writer to the moves it is for', () => {
    const from = (status: UserSubmission['status'], by: SubmissionActor) =>
      reachable(SUBMISSION_MACHINE, SUBMISSION_STATUSES, status, by).sort()

    expect(from('pending', 'screening')).toEqual(['spam'])
    expect(from('accepted', 'screening')).toEqual([])
    expect(from('pending', 'block')).toEqual(['spam'])
    expect(from('failed', 'delivery')).toEqual(['accepted', 'failed', 'pending'])
    // A verdict on a row is not something a second sign-up may fold away.
    expect(from('spam', 'repeat-signup')).toEqual([])
    expect(from('rejected', 'repeat-signup')).toEqual([])
  })

  it('offers a resend from `failed`, to an admin alone', () => {
    expect(RESEND_FROM).toEqual(['failed'])
    for (const status of RESEND_FROM) {
      expect(can(SUBMISSION_MACHINE, status, 'pending', 'admin')).toBe(true)
      expect(can(SUBMISSION_MACHINE, status, 'pending', 'review')).toBe(false)
    }
    // A reviewer's own Reopen reaches `pending` too, from the statuses nothing
    // was ever sent for — which is why the two are not one set.
    expect(can(SUBMISSION_MACHINE, 'rejected', 'pending', 'review')).toBe(true)
  })

  it('settles a spam refusal for an admin only', () => {
    expect(can(SUBMISSION_MACHINE, 'spam', 'confirmed_spam', 'admin')).toBe(true)
    expect(can(SUBMISSION_MACHINE, 'spam', 'confirmed_spam', 'review')).toBe(false)
  })
})

describe('transition', () => {
  const fakePayload = (docs: unknown[]) => {
    const update = vi.fn().mockResolvedValue({ docs, errors: [] })
    return {
      payload: { update, logger: { info: vi.fn() } } as unknown as Payload,
      update,
    }
  }

  it('claims the move on the state it read, and reports a lost race', async () => {
    const won = fakePayload([{ id: 7 }])
    await expect(
      transition({
        payload: won.payload,
        machine: EVENT_MACHINE,
        collection: 'events',
        id: 7,
        from: 'unverified',
        to: 'denied',
        by: 'community',
        data: { _status: 'draft' },
      }),
    ).resolves.toBe(true)

    expect(won.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'events',
        data: { _status: 'draft', verificationStage: 'denied' },
        where: { and: [{ id: { equals: 7 } }, { verificationStage: { equals: 'unverified' } }] },
      }),
    )

    const lost = fakePayload([])
    await expect(
      transition({
        payload: lost.payload,
        machine: EVENT_MACHINE,
        collection: 'events',
        id: 7,
        from: 'unverified',
        to: 'denied',
        by: 'community',
      }),
    ).resolves.toBe(false)
  })

  it('ANDs what else the caller read into the claim', async () => {
    const { payload, update } = fakePayload([{ id: 7 }])
    await transition({
      payload,
      machine: EVENT_MACHINE,
      collection: 'events',
      id: 7,
      from: 'verified',
      to: 'reminded',
      by: 'job:expireEvents',
      expect: { nextCheckAt: { equals: '2026-01-01T00:00:00.000Z' } },
    })
    expect(update.mock.calls[0]![0].where.and[1]).toEqual({
      and: [
        { verificationStage: { equals: 'verified' } },
        { nextCheckAt: { equals: '2026-01-01T00:00:00.000Z' } },
      ],
    })
  })

  it('hands the writer the actor, so the guard can judge the patch', async () => {
    const write = vi.fn().mockResolvedValue(true)
    await transition({
      payload: {} as Payload,
      machine: EVENT_MACHINE,
      collection: 'events',
      id: 7,
      from: 'urgent',
      to: 'expired',
      by: 'job:expireEvents',
      write,
    })
    expect(declaredActor(write.mock.calls[0]![0].context, EVENT_MACHINE)).toBe('job:expireEvents')
  })

  it('throws on a move nobody holds — a defect here, not a race', async () => {
    await expect(
      transition({
        payload: {} as Payload,
        machine: EVENT_MACHINE,
        collection: 'events',
        id: 7,
        from: 'finished',
        to: 'verified',
        by: 'verify',
        write: vi.fn(),
      }),
    ).rejects.toThrow(/cannot move verification stage from finished to verified/)
  })
})

/**
 * The one caller whose claim travels through a `write` of its own.
 *
 * `syncCommunityFeedback` runs inside a visitor's vote, where a throw rolls the
 * vote back (#842) — so the claim is what keeps an adoption landing mid-recount
 * from reaching the guard as a move `community` does not hold.
 */
describe('syncCommunityFeedback', () => {
  const votedDown = async (stage: VerificationStage) => {
    const update = vi.fn().mockResolvedValue({ docs: [{ id: 7 }], errors: [] })
    const payload = {
      update,
      logger: { info: vi.fn() },
      findDistinct: vi.fn(
        async ({ where }: { where: { and: { eventFeedback?: { equals: string } }[] } }) => ({
          // Six denials and nothing else: past `DENIAL_MINIMUM`, and a Wilson
          // upper bound the threshold clears, so the verdict is `denied`.
          totalDocs: where.and.some((clause) => clause.eventFeedback?.equals === 'denied') ? 6 : 0,
        }),
      ),
      findByID: vi.fn().mockResolvedValue({ id: 7, verificationStage: stage, systemMeta: {} }),
    } as unknown as Payload

    await syncCommunityFeedback({
      collection: { slug: 'user-submissions' },
      context: {},
      data: { type: 'registration', event: 7, eventFeedback: 'denied' },
      doc: {} as UserSubmission,
      operation: 'update',
      previousDoc: { eventFeedback: null } as unknown as UserSubmission,
      req: { payload, context: {}, user: null },
    } as never)

    return update
  }

  it('claims the stage it read, so an adoption mid-recount survives', async () => {
    const update = await votedDown('unverified')

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          and: [{ id: { equals: 7 } }, { verificationStage: { equals: 'unverified' } }],
        },
      }),
    )
    expect(update.mock.calls[0]![0].data).toMatchObject({
      _status: 'draft',
      verificationStage: 'denied',
    })
  })

  it('writes only the tally once the listing is nobody-to-deny', async () => {
    const update = await votedDown('verified')

    expect(update.mock.calls[0]![0].data.verificationStage).toBeUndefined()
  })
})
