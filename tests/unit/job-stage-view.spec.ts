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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { MeditationTranscripts } from '@/collections/MeditationTranscripts/MeditationTranscripts'
import {
  decideJobStage,
  type JobStageConfig,
  readJobStageConfig,
} from '@/components/admin/JobStageView/stages'

import { clientEntries } from '../utils/importGraph'

const VIEW_DIR = join(__dirname, '../../src/components/admin/JobStageView')

/**
 * Both files below explain in prose what they must not contain, so a bare
 * regex over the source matches the explanation and fails on a correct file.
 */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const statusField = (): { defaultValue?: unknown; options?: unknown } => {
  const field = MeditationTranscripts.fields.find(
    (f) => 'name' in f && f.name === 'status',
  ) as undefined | { defaultValue?: unknown; options?: unknown }
  if (!field) throw new Error('meditation-transcripts declares no `status` field')
  return field
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

describe('decideJobStage', () => {
  const config: JobStageConfig = { progressField: 'progress', runningStages: ['working'] }

  it('waits on a declared running stage, and falls through on any other', () => {
    expect(decideJobStage(config, { progress: 3, status: 'working' })).toEqual({
      progress: 3,
      stage: 'working',
      waiting: true,
    })
    expect(decideJobStage(config, { status: 'finished' })).toEqual({ waiting: false })
  })

  it('falls through when the status column holds nothing it can read', () => {
    expect(decideJobStage(config, {})).toEqual({ waiting: false })
    expect(decideJobStage(config, null)).toEqual({ waiting: false })
    expect(decideJobStage(config, { status: ['working'] })).toEqual({ waiting: false })
  })

  it('reads the stage from `statusField` when the collection names one', () => {
    const named: JobStageConfig = { runningStages: ['working'], statusField: 'stage' }
    expect(decideJobStage(named, { stage: 'working', status: 'finished' })).toMatchObject({
      waiting: true,
    })
    expect(decideJobStage(named, { status: 'working' })).toEqual({ waiting: false })
  })

  it('waits with no count where the collection declares no `progressField`', () => {
    const countless: JobStageConfig = { runningStages: ['working'] }
    expect(decideJobStage(countless, { progress: 3, status: 'working' })).toEqual({
      progress: null,
      stage: 'working',
      waiting: true,
    })
  })

  it('waits with no count where the declared column holds no number', () => {
    expect(decideJobStage(config, { progress: '3', status: 'working' })).toEqual({
      progress: null,
      stage: 'working',
      waiting: true,
    })
  })
})

describe('the view itself', () => {
  it('names neither of the collections it was written for', () => {
    for (const file of ['JobStageView.tsx', 'stages.ts']) {
      const source = readFileSync(join(VIEW_DIR, file), 'utf8')
      expect(source).not.toMatch(/event-imports|eventImports|meditation-transcripts/)
    }
  })

  it('stays a server component that fetches nothing', () => {
    for (const file of ['JobStageView.tsx', 'stages.ts']) {
      // `clientEntries()` applies the real directive rule — behind leading
      // comments, either quote — rather than a regex that would also match
      // these files' own prose about the directive.
      expect(clientEntries()).not.toContain(join(VIEW_DIR, file))
      expect(withoutComments(readFileSync(join(VIEW_DIR, file), 'utf8'))).not.toMatch(
        /useSWR|\bfetch\(|setInterval/,
      )
    }
  })
})

describe('meditation-transcripts', () => {
  it('declares `processing` as its only running stage', () => {
    expect(readJobStageConfig(MeditationTranscripts.admin?.custom)).toEqual({
      runningStages: ['processing'],
    })
  })

  it('leaves a freshly created row editable, because `status` defaults outside that list', () => {
    const { defaultValue } = statusField()
    const config = readJobStageConfig(MeditationTranscripts.admin?.custom)

    expect(defaultValue).toBe('queued')
    expect(config).not.toBeNull()
    expect(decideJobStage(config!, { status: defaultValue })).toEqual({ waiting: false })
  })

  it('declares every running stage the status column can actually hold', () => {
    const { options } = statusField()
    const config = readJobStageConfig(MeditationTranscripts.admin?.custom)

    expect(config!.runningStages.every((stage) => (options as string[]).includes(stage))).toBe(true)
  })

  it('registers the view on its default edit route', () => {
    expect(MeditationTranscripts.admin?.components?.views?.edit).toEqual({
      default: { Component: '@/components/admin/JobStageView/JobStageView' },
    })
  })
})
