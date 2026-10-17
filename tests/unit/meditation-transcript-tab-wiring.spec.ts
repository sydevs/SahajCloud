import type { CollectionConfig, Field, TabsField } from 'payload'

import { describe, expect, it } from 'vitest'

import { collections } from '@/collections'

import { sourceOf, SRC } from '../utils/importGraph'

/**
 * Where the Transcript tab sits, and that Payload can resolve the component it
 * names.
 *
 * It reads the **real** collection array rather than a fixture, which would
 * assume the very thing under test — the tab tree, and the names already in
 * it. The import boots no Payload instance.
 *
 * The generated `src/app/(payload)/admin/importMap.js` is asserted because
 * nothing else proves the string path resolves: that entry exists only because
 * `pnpm generate:importmap` found the component on the sanitized config.
 */

const PANEL = '@/components/admin/MeditationTranscript'

const isTabs = (field: Field): field is TabsField => field.type === 'tabs'

const tabsIn = (fields: Field[], owner: string): TabsField['tabs'] => {
  const tabs = fields.find(isTabs)
  if (!tabs) throw new Error(`${owner} holds no tabs field`)
  return tabs.tabs
}

const meditations = collections.find(
  (collection) => (collection as CollectionConfig).slug === 'meditations',
) as CollectionConfig

/** The Video tab's nested tabs, in declaration order. */
const videoTabs = (): TabsField['tabs'] => {
  const video = tabsIn(meditations.fields, 'meditations').find((tab) => tab.label === 'Video')
  if (!video) throw new Error('meditations has no Video tab')
  return tabsIn(video.fields, 'the Video tab')
}

const named = (fields: Field[], name: string): Field | undefined =>
  fields.find((field) => 'name' in field && field.name === name)

describe('the meditation Transcript tab', () => {
  it('is the first nested tab under Video', () => {
    expect(videoTabs()[0]?.label).toBe('Transcript')
  })

  it('opens the Live Preview panel on arrival, with no path of its own', () => {
    const target = named(videoTabs()[0].fields, 'transcript__preview_target')

    expect(target?.admin?.custom?.previewTarget).toEqual({ autoOpen: true })
  })

  it('renders the panel from a `ui` field, so no column and no type are added', () => {
    const panel = named(videoTabs()[0].fields, 'transcriptPanel')

    expect(panel?.type).toBe('ui')
    expect(panel?.admin?.components?.Field).toBe(PANEL)
  })

  // `transcript` is the native `join` onto `meditation-transcripts`. Shadowing
  // it would take the join's rows off the Details tab.
  it('does not shadow the `transcript` join', () => {
    const names = videoTabs()[0].fields.flatMap((field) =>
      'name' in field && field.name ? [field.name] : [],
    )

    expect(names).not.toContain('transcript')
    expect(names).toContain('transcriptPanel')
  })

  it('has its component in the generated import map', () => {
    expect(sourceOf(`${SRC}/app/(payload)/admin/importMap.js`)).toContain(`"${PANEL}#default"`)
  })
})
