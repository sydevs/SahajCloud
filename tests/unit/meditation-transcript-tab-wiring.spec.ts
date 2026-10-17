import type { CollectionConfig, Field, TabsField } from 'payload'

import { describe, expect, it } from 'vitest'

import { collections } from '@/collections'

import { sourceOf, SRC } from '../utils/importGraph'

/**
 * The Transcript tab is wired where the Decision put it, and Payload can
 * resolve the component it names.
 *
 * It runs over the **real** collection array rather than a fixture: a fixture
 * would assume the very thing under test — where the tab sits, and what the
 * names around it already are. The import boots no Payload instance.
 *
 * The generated `src/app/(payload)/admin/importMap.js` is asserted because
 * nothing else here proves the string path resolves: that entry exists only
 * because `pnpm generate:importmap` found the component on the sanitized
 * config.
 */

const PANEL = '@/components/admin/MeditationTranscript'

const isTabs = (field: Field): field is TabsField => field.type === 'tabs'

const tabsIn = (fields: Field[]): TabsField['tabs'] => {
  const tabs = fields.find(isTabs)
  if (!tabs) throw new Error('no tabs field here')
  return tabs.tabs
}

const meditations = collections.find(
  (collection) => (collection as CollectionConfig).slug === 'meditations',
) as CollectionConfig

const named = (fields: Field[], name: string): Field | undefined =>
  fields.find((field) => 'name' in field && field.name === name)

describe('the meditation Transcript tab', () => {
  const videoTab = tabsIn(meditations.fields).find((tab) => tab.label === 'Video')
  const nested = tabsIn(videoTab!.fields)
  const transcript = nested[0]

  it('is the first nested tab under Video', () => {
    expect(videoTab).toBeDefined()
    expect(transcript?.label).toBe('Transcript')
  })

  it('opens the Live Preview panel on arrival, with no path of its own', () => {
    const target = named(transcript!.fields, 'transcript__preview_target')

    expect(target?.admin?.custom?.previewTarget).toEqual({ autoOpen: true })
  })

  it('renders the panel from a `ui` field, so no column and no type are added', () => {
    const panel = named(transcript!.fields, 'transcript_panel')

    expect(panel?.type).toBe('ui')
    expect(panel?.admin?.components?.Field).toBe(PANEL)
  })

  /**
   * `transcript` is the native `join` onto `meditation-transcripts`, and a
   * `name` must be unique among its siblings — shadowing it would take the
   * join's rows off the Details tab.
   */
  it('does not shadow the `transcript` join', () => {
    const names = new Set(
      transcript!.fields.flatMap((field) => ('name' in field && field.name ? [field.name] : [])),
    )

    expect(names.has('transcript')).toBe(false)
    expect(names.has('transcript_panel')).toBe(true)
  })

  it('has its component in the generated import map', () => {
    expect(sourceOf(`${SRC}/app/(payload)/admin/importMap.js`)).toContain(`"${PANEL}#default"`)
  })
})
