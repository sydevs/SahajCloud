/**
 * The pure half of `JobStageView`: what a collection's declaration selects,
 * and the two structural properties the view's acceptance criteria name but no
 * assertion about a rendered page can reach — that it names no collection, and
 * that it never fetches. The third, that it forwards every `DocumentSlots`
 * member, is the `PickedClientProps` annotation's: a type catches the Payload
 * upgrade that adds one, where a regex over the installed `.d.ts` could not.
 *
 * The declaration cases below are inline literals, but the pair that matters
 * most is read off the real `meditation-transcripts` config: that the
 * collection declares `processing` and not `queued`, and that `queued` is what
 * `status` defaults to. Stated as two inline fixtures those two facts could
 * drift apart silently, and the row stranded behind a waiting view is what
 * drift would cost (#960).
 */
import type { CollectionConfig } from 'payload'

import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { MeditationTranscripts } from '@/collections/MeditationTranscripts/MeditationTranscripts'
import {
  type JobStageConfig,
  jobStageWait,
  readJobStageConfig,
} from '@/components/admin/JobStageView/stages'
import { TRANSCRIPTION_STALL_MS } from '@/lib/meditations/transcript'
import { IMPORT_STALL_MS } from '@/plugins/eventImport/constants'
import { importCollection } from '@/plugins/eventImport/importCollection'

import { hasDirective, SRC, sourceOf } from '../utils/importGraph'

// Joined from `SRC`, the same root `hasDirective`'s callers use, so a path
// here cannot drift from the one those guards walk.
const inFolder = (file: string) => join(SRC, 'components/admin/JobStageView', file)

// The server half. `CheckAgain.tsx` is deliberately not here: it carries the
// click that re-reads the stage, so it is the folder's one client component
// and is asserted as such below.
const VIEW_FILES = ['JobStageView.tsx', 'stages.ts'].map(inFolder)

/**
 * Both checks below read the code without its prose. The view explains in
 * comments what it must not contain and which collection shapes drove the
 * contract, so matching the source whole fails on a correct file — and a
 * comment naming the first consumer is not a dependency on it.
 */
const codeOf = (file: string): string =>
  sourceOf(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

type Collection = CollectionConfig

const EventImports: CollectionConfig = importCollection

const fieldNamed = (collection: Collection, name: string) => {
  const field = collection.fields.find((f) => 'name' in f && f.name === name)
  if (!field) throw new Error(`${collection.slug} declares no \`${name}\` field`)
  return field as { defaultValue?: unknown; options?: unknown }
}

const statusField = (collection: Collection = MeditationTranscripts) =>
  fieldNamed(collection, 'status')

const stageConfig = (collection: Collection): JobStageConfig => {
  const config = readJobStageConfig(collection.admin?.custom)
  if (!config) throw new Error(`${collection.slug} declares no \`jobStage\``)
  return config
}

const transcriptConfig = (): JobStageConfig => stageConfig(MeditationTranscripts)

describe('readJobStageConfig', () => {
  it('reads a declaration, keeping `progressField` only when one is given', () => {
    expect(readJobStageConfig({ jobStage: { runningStages: ['a'] } })).toEqual({
      runningStages: ['a'],
    })
    expect(
      readJobStageConfig({
        jobStage: { progressField: 'done', runningStages: ['a'], totalField: 'all' },
      }),
    ).toEqual({ progressField: 'done', runningStages: ['a'], totalField: 'all' })
  })

  it('keeps a usable `staleAfterMs`, and drops one that would open every row', () => {
    expect(readJobStageConfig({ jobStage: { runningStages: ['a'], staleAfterMs: 1000 } })).toEqual({
      runningStages: ['a'],
      staleAfterMs: 1000,
    })
    expect(readJobStageConfig({ jobStage: { runningStages: ['a'], staleAfterMs: 0 } })).toEqual({
      runningStages: ['a'],
    })
    expect(readJobStageConfig({ jobStage: { runningStages: ['a'], staleAfterMs: '60' } })).toEqual({
      runningStages: ['a'],
    })
  })

  it('refuses a declaration with no usable `runningStages`', () => {
    expect(readJobStageConfig(undefined)).toBeNull()
    expect(readJobStageConfig({})).toBeNull()
    expect(readJobStageConfig({ jobStage: {} })).toBeNull()
    expect(readJobStageConfig({ jobStage: { runningStages: 'processing' } })).toBeNull()
    expect(readJobStageConfig({ jobStage: { runningStages: ['ok', 7] } })).toBeNull()
  })
})

describe('jobStageWait', () => {
  const config: JobStageConfig = { progressField: 'progress', runningStages: ['working'] }

  it('waits on a declared running stage, and falls through on any other', () => {
    expect(jobStageWait(config, { progress: 3, status: 'working' })).toEqual({
      progress: 3,
      stage: 'working',
      total: null,
    })
    expect(jobStageWait(config, { status: 'finished' })).toBeNull()
  })

  it('falls through when the status column holds nothing it can read', () => {
    expect(jobStageWait(config, {})).toBeNull()
    expect(jobStageWait(config, null)).toBeNull()
    expect(jobStageWait(config, { status: ['working'] })).toBeNull()
  })

  it('reads the stage from `statusField` when the collection names one', () => {
    const named: JobStageConfig = { runningStages: ['working'], statusField: 'stage' }
    expect(jobStageWait(named, { stage: 'working', status: 'finished' })).not.toBeNull()
    expect(jobStageWait(named, { status: 'working' })).toBeNull()
  })

  it('waits with no count where the collection declares no `progressField`', () => {
    const countless: JobStageConfig = { runningStages: ['working'] }
    expect(jobStageWait(countless, { progress: 3, status: 'working' })).toEqual({
      progress: null,
      stage: 'working',
      total: null,
    })
  })

  it('waits with no count where the declared column holds no number', () => {
    expect(jobStageWait(config, { progress: '3', status: 'working' })).toEqual({
      progress: null,
      stage: 'working',
      total: null,
    })
  })

  it('reads a count out of a group, which is where #912 keeps one', () => {
    const grouped: JobStageConfig = {
      progressField: 'progress.done',
      runningStages: ['working'],
    }
    expect(jobStageWait(grouped, { progress: { done: 7 }, status: 'working' })).toEqual({
      progress: 7,
      stage: 'working',
      total: null,
    })
    expect(jobStageWait(grouped, { progress: null, status: 'working' })).toEqual({
      progress: null,
      stage: 'working',
      total: null,
    })
  })

  /**
   * #960's promise is that #912 adopts the view unchanged, and #912's
   * `event-imports` knows its denominator — so a count with no total beside it
   * would render "7 done so far" for a job that knows it is 7 of 20.
   */
  it('reads a total beside the count, from a second declared path', () => {
    const counted: JobStageConfig = {
      progressField: 'progress.done',
      runningStages: ['working'],
      totalField: 'progress.total',
    }
    expect(jobStageWait(counted, { progress: { done: 7, total: 20 }, status: 'working' })).toEqual({
      progress: 7,
      stage: 'working',
      total: 20,
    })
  })

  /**
   * Nothing on `main` expires a running stage, so a run lost to a restart
   * would otherwise hold its row behind the waiting view permanently.
   */
  describe('a declared stall window', () => {
    const stalling: JobStageConfig = { runningStages: ['working'], staleAfterMs: 1000 }
    const now = Date.parse('2026-10-16T12:00:00.000Z')
    const at = (msAgo: number) => new Date(now - msAgo).toISOString()

    it('keeps waiting while the window has not passed', () => {
      expect(jobStageWait(stalling, { status: 'working', updatedAt: at(900) }, now)).toEqual({
        progress: null,
        stage: 'working',
        total: null,
      })
    })

    it('opens the form once the window has passed', () => {
      expect(jobStageWait(stalling, { status: 'working', updatedAt: at(1001) }, now)).toBeNull()
    })

    it('keeps waiting where `updatedAt` cannot be read', () => {
      expect(jobStageWait(stalling, { status: 'working' }, now)).not.toBeNull()
      expect(
        jobStageWait(stalling, { status: 'working', updatedAt: 'not a date' }, now),
      ).not.toBeNull()
    })

    it('waits forever where the collection declares no window', () => {
      const forever: JobStageConfig = { runningStages: ['working'] }
      expect(jobStageWait(forever, { status: 'working', updatedAt: at(1e9) }, now)).not.toBeNull()
    })
  })

  it('waits with no total where the declared column holds no number yet', () => {
    const counted: JobStageConfig = {
      progressField: 'done',
      runningStages: ['working'],
      totalField: 'total',
    }
    expect(jobStageWait(counted, { done: 7, status: 'working' })).toEqual({
      progress: 7,
      stage: 'working',
      total: null,
    })
  })
})

describe('the view itself', () => {
  it('names neither of the collections it was written for', () => {
    for (const file of VIEW_FILES) {
      expect(codeOf(file)).not.toMatch(/event-imports|eventImports|meditation-transcripts/)
    }
  })

  /**
   * The split is the point, not an accident of where code landed: a server
   * component cannot carry the refresh handler, and a client one cannot be
   * handed the `req` and `payload` props the fall-through forwards.
   */
  it("keeps the refresh control as the folder's only client component", () => {
    expect(hasDirective(inFolder('CheckAgain.tsx'), 'use client')).toBe(true)
  })

  it('stays a server component that fetches nothing', () => {
    for (const file of VIEW_FILES) {
      // `hasDirective` is the rule the two bundle guards apply — behind leading
      // comments, either quote — rather than a regex that would also match
      // these files' own prose about the directive.
      expect(hasDirective(file, 'use client')).toBe(false)
      expect(codeOf(file)).not.toMatch(/useSWR|\bfetch\(|setInterval/)
    }
  })
})

describe('meditation-transcripts', () => {
  it('declares `processing` as its only running stage, behind the stall window', () => {
    expect(transcriptConfig()).toEqual({
      runningStages: ['processing'],
      staleAfterMs: TRANSCRIPTION_STALL_MS,
    })
  })

  it('holds a row whose run is in flight, and releases it past the stall window', () => {
    // `status` is virtual since #968 — derived from the retained job row — so
    // there is no default to read off the field. A fresh row has no cues and an
    // unfinished job, which derives `processing`.
    const now = Date.now()
    const iso = (ms: number) => new Date(ms).toISOString()
    expect(
      jobStageWait(transcriptConfig(), { status: 'processing', updatedAt: iso(now) }, now),
    ).toEqual({ progress: null, stage: 'processing', total: null })
    expect(
      jobStageWait(
        transcriptConfig(),
        { status: 'processing', updatedAt: iso(now - TRANSCRIPTION_STALL_MS - 1000) },
        now,
      ),
    ).toBeNull()
  })

  it('declares every running stage the status column can actually hold', () => {
    const { options } = statusField()

    expect(
      transcriptConfig().runningStages.every((stage) => (options as string[]).includes(stage)),
    ).toBe(true)
  })

  it('registers the view on its default edit route', () => {
    expect(MeditationTranscripts.admin?.components?.views?.edit).toEqual({
      default: { Component: '@/components/admin/JobStageView/JobStageView' },
    })
  })
})

describe('imports', () => {
  it('declares `pending` as its only running stage, behind the stall window, with no count', () => {
    // The plugin publishes no progress column, so the view waits without one.
    expect(stageConfig(EventImports)).toEqual({
      runningStages: ['pending'],
      staleAfterMs: IMPORT_STALL_MS,
    })
  })

  it('declares every running stage the status column can actually hold', () => {
    const options = statusField(EventImports).options as { value: string }[]
    const held = options.map(({ value }) => value)

    for (const stage of stageConfig(EventImports).runningStages) {
      expect(held).toContain(stage)
    }
  })

  /**
   * The one collection whose `status` defaults INTO a running stage, against
   * the view's own rule — because here that default is true: the create queues
   * the plugin's import job. `staleAfterMs` is the whole safety, so the case
   * asserts both halves of it, and deleting the window makes the second fail.
   */
  it('holds a fresh import behind the view, and hands it back past the stall window', () => {
    const config = stageConfig(EventImports)
    const { defaultValue } = statusField(EventImports)
    const created = { status: defaultValue, updatedAt: '2026-10-17T00:00:00.000Z' }
    const createdAt = Date.parse(created.updatedAt)

    expect(defaultValue).toBe('pending')
    expect(jobStageWait(config, created, createdAt + IMPORT_STALL_MS)).not.toBeNull()
    expect(jobStageWait(config, created, createdAt + IMPORT_STALL_MS + 1)).toBeNull()
  })

  it('registers the view on its default edit route', () => {
    expect(EventImports.admin?.components?.views?.edit).toEqual({
      default: { Component: '@/components/admin/JobStageView/JobStageView' },
    })
  })
})
