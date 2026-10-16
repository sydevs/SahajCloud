/**
 * The pure half of `JobStageView`: what a collection's declaration selects,
 * and the two structural properties the view's acceptance criteria name but no
 * assertion about a rendered page can reach — that it names no collection, and
 * that it never fetches.
 *
 * The declaration cases below are inline literals, but the pair that matters
 * most is read off the real `meditation-transcripts` config: that the
 * collection declares `processing` and not `queued`, and that `queued` is what
 * `status` defaults to. Stated as two inline fixtures those two facts could
 * drift apart silently, and the row stranded behind a waiting view is what
 * drift would cost (#960).
 */
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { MeditationTranscripts } from '@/collections/MeditationTranscripts/MeditationTranscripts'
import {
  type JobStageConfig,
  jobStageWait,
  readJobStageConfig,
} from '@/components/admin/JobStageView/stages'

import { hasDirective, SRC, sourceOf } from '../utils/importGraph'

// Joined from `SRC`, the same root `hasDirective`'s callers use, so a path
// here cannot drift from the one those guards walk.
const VIEW_FILES = ['JobStageView.tsx', 'stages.ts'].map((file) =>
  join(SRC, 'components/admin/JobStageView', file),
)

const PAYLOAD_ADMIN_TYPES = join(SRC, '../node_modules/payload/dist/admin/types.d.ts')

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

const statusField = (): { defaultValue?: unknown; options?: unknown } => {
  const field = MeditationTranscripts.fields.find(
    (f) => 'name' in f && f.name === 'status',
  ) as undefined | { defaultValue?: unknown; options?: unknown }
  if (!field) throw new Error('meditation-transcripts declares no `status` field')
  return field
}

const transcriptConfig = (): JobStageConfig => {
  const config = readJobStageConfig(MeditationTranscripts.admin?.custom)
  if (!config) throw new Error('meditation-transcripts declares no `jobStage`')
  return config
}

describe('readJobStageConfig', () => {
  it('reads a declaration, keeping `progressField` only when one is given', () => {
    expect(readJobStageConfig({ jobStage: { runningStages: ['a'] } })).toEqual({
      runningStages: ['a'],
    })
    expect(
      readJobStageConfig({ jobStage: { progressField: 'done', runningStages: ['a'] } }),
    ).toEqual({ progressField: 'done', runningStages: ['a'] })
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
    })
  })

  it('waits with no count where the declared column holds no number', () => {
    expect(jobStageWait(config, { progress: '3', status: 'working' })).toEqual({
      progress: null,
      stage: 'working',
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
    })
    expect(jobStageWait(grouped, { progress: null, status: 'working' })).toEqual({
      progress: null,
      stage: 'working',
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
   * The one silent failure in the fall-through: every `DocumentSlots` member is
   * optional, so a slot a Payload release adds would be dropped with no type
   * error, and the only symptom is a control missing from this view while the
   * default view still shows it. Read off the installed declaration, so the
   * upgrade that adds one fails here.
   */
  it('forwards every document slot Payload declares', () => {
    const declaration = sourceOf(PAYLOAD_ADMIN_TYPES).match(
      /export type DocumentSlots = \{([^}]*)\}/,
    )
    if (!declaration) throw new Error(`No DocumentSlots in ${PAYLOAD_ADMIN_TYPES}`)

    const slots = [...declaration[1].matchAll(/^\s*(\w+)\??:/gm)].map(([, key]) => key)
    expect(slots.length).toBeGreaterThan(5)

    const forwarding = codeOf(VIEW_FILES[0])
    for (const slot of slots) expect(forwarding).toContain(`${slot}: props.${slot},`)
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
  it('declares `processing` as its only running stage', () => {
    expect(transcriptConfig()).toEqual({ runningStages: ['processing'] })
  })

  it('leaves a freshly created row editable, because `status` defaults outside that list', () => {
    const { defaultValue } = statusField()

    expect(defaultValue).toBe('queued')
    expect(jobStageWait(transcriptConfig(), { status: defaultValue })).toBeNull()
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
