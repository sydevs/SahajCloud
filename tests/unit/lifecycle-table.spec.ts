import type { Payload } from 'payload'

import { describe, expect, it, vi } from 'vitest'

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
import { judgeTransition } from '@/lib/stateMachine/guard'
import { ANY_STATE, can } from '@/lib/stateMachine/machine'
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
  const machine = {
    name: 'test state',
    field: 'state',
    moves: [{ from: ['a'], to: 'b', by: ['one'] }],
  } as const

  it('judges nothing when the write left the column alone', () => {
    expect(judgeTransition({ machine, from: 'a', to: undefined, by: 'one' })).toBeNull()
    expect(judgeTransition({ machine, from: 'a', to: 'a', by: 'one' })).toBeNull()
  })

  it('refuses a move that names no writer', () => {
    expect(judgeTransition({ machine, from: 'a', to: 'b', by: null })).toContain('names no writer')
  })

  it('refuses a move the table does not hold', () => {
    expect(judgeTransition({ machine, from: 'b', to: 'a', by: 'one' })).toContain('cannot move')
    expect(judgeTransition({ machine, from: 'a', to: 'b', by: 'one' })).toBeNull()
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
    expect(write.mock.calls[0]![0].context).toMatchObject({ stageActor: 'job:expireEvents' })
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
