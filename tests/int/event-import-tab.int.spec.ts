/**
 * The Import view's gate (#828) — the part only a database can answer.
 *
 * ⚠ **The tab is not the gate, and this is why the gate needs its own spec.**
 * `tab.condition` and `ImportTabLink` between them decide what a volunteer is
 * *offered*; `/admin/collections/regions/<id>/import` answers a typed URL with
 * neither of them involved. So the refusals below are what actually stands
 * between a manager and a region they do not manage.
 *
 * ⚠ **The wiring is the subject, not the predicates.** `mayStageImport` and the
 * levels have a unit spec, and `targetOwnership` is covered through the upload
 * endpoint. What no pure spec can see is whether this sequence asks all three —
 * a helper spec'd in isolation while its caller never calls it is how #132's
 * `failed` status stayed unreachable behind four green assertions.
 *
 * The locale half is deliberately absent: a hand-built `req` carries a flat
 * `roles` array that passes every scope, so only the REST-driven cases in
 * `event-import-upload.int.spec.ts` can see it (#701).
 */
import type { Payload, PayloadRequest } from 'payload'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { OWNERSHIP_REFUSAL } from '@/collections/EventImports/batchRequest'
import { STAGE_IMPORT_REFUSAL } from '@/collections/EventImports/capability'
import { unproposableTargetMessage } from '@/collections/EventImports/propose/tree'
import { importGate, UNSAVED_REFUSAL } from '@/components/admin/RegionImport/importGate'
import type { Client, Manager, Region } from '@/payload-types'

import { testData } from '../utils/testData'
import { createTestEnvironment } from '../utils/testHelpers'

describe('the Import view gate', () => {
  let payload: Payload
  let cleanup: () => Promise<void>
  let admin: Manager
  let owner: Manager
  let outsider: Manager
  let regionless: Manager
  let inactive: Manager
  let client: Client
  let germany: Region
  let berlin: Region
  let hall: Region

  const reqAs = (user: Manager | Client): PayloadRequest =>
    ({ payload, headers: new Headers(), user, locale: 'en', context: {} }) as unknown as PayloadRequest

  async function refusalFor(user: Manager | Client, region: Region | null): Promise<string | null> {
    const gate = await importGate({ region, req: reqAs(user) })
    return gate.ok ? null : gate.refusal
  }

  beforeAll(async () => {
    const env = await createTestEnvironment()
    payload = env.payload
    cleanup = env.cleanup
    admin = env.adminUser

    owner = await testData.createManager(payload, {
      name: 'Tab Owner',
      email: 'tab-owner@example.com',
      roles: ['atlas-manager'],
    })
    outsider = await testData.createManager(payload, {
      name: 'Tab Outsider',
      email: 'tab-outsider@example.com',
      roles: ['atlas-manager'],
    })
    // ⚠ Holds the grant and no region, which is a different refusal from the
    // outsider's — and the only one that never reaches the subtree query.
    regionless = await testData.createManager(payload, {
      name: 'Tab Newcomer',
      email: 'tab-newcomer@example.com',
      roles: ['atlas-manager'],
    })
    inactive = await testData.createManager(payload, {
      name: 'Tab Retired',
      email: 'tab-retired@example.com',
      type: 'inactive' as const,
      roles: ['atlas-manager'],
    })
    client = await testData.createClient(payload, admin.id, {
      name: 'Tab Atlas Widget',
      roles: ['sahaj-atlas-client'],
    })

    germany = await testData.createRegion(payload, {
      name: 'Germany',
      level: 'country',
      managers: [owner.id],
    })
    berlin = await testData.createRegion(payload, {
      name: 'Berlin',
      level: 'city',
      parent: germany.id,
    })
    hall = await testData.createRegion(payload, {
      name: 'Kreuzberg Hall',
      level: 'venue',
      parent: berlin.id,
    })
    // ⚠ The outsider has to manage something, or the refusal reports "you manage
    // no region" and the subtree check never runs.
    await testData.createRegion(payload, {
      name: 'Austria',
      level: 'country',
      managers: [outsider.id],
    })
  })

  afterAll(async () => {
    await cleanup()
  })

  it('offers the importer on a region the caller manages', async () => {
    expect(await refusalFor(owner, germany)).toBeNull()
    expect(await refusalFor(owner, berlin)).toBeNull()
  })

  it('offers it to an admin, who manages no region explicitly', async () => {
    expect(await refusalFor(admin, germany)).toBeNull()
  })

  it('refuses a venue, the one level a batch cannot target', async () => {
    expect(await refusalFor(owner, hall)).toBe(unproposableTargetMessage('venue'))
  })

  it('refuses a region outside the caller’s subtree', async () => {
    expect(await refusalFor(outsider, germany)).toBe(OWNERSHIP_REFUSAL['not-yours'])
  })

  it('tells a manager who holds no region that, rather than naming the region', async () => {
    expect(await refusalFor(regionless, germany)).toBe(OWNERSHIP_REFUSAL['no-regions'])
  })

  /**
   * Both of these would be refused by the ownership check too, so the message is
   * what says which gate answered — and the capability gate has to answer first,
   * or an inactive manager's refusal would name somebody else's region.
   */
  it('refuses an inactive manager on the capability, before any region is read', async () => {
    expect(await refusalFor(inactive, germany)).toBe(STAGE_IMPORT_REFUSAL)
  })

  it('refuses an API client the same way', async () => {
    expect(await refusalFor(client, germany)).toBe(STAGE_IMPORT_REFUSAL)
  })

  it('refuses a region that has not been saved yet', async () => {
    expect(await refusalFor(owner, { level: 'country' } as Region)).toBe(UNSAVED_REFUSAL)
  })
})
