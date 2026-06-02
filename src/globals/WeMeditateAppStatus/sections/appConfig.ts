import { VIBE_CHECK_IDENTIFIERS } from '@/globals/WeMeditateAppConfig/WeMeditateAppConfig'
import {
  isUploadAssigned,
  labelOf,
  refId,
  type DocumentReport,
  type SectionSpec,
} from '@/lib/status'

import { getWmAppConfig, meditationMatchesLocale, type WeMeditateAppStatusConfig } from './shared'

interface WmAppConfigSlice {
  selfRealizationMeditation?: unknown
  postRealizationLecture?: unknown
  vibeCheckTracks?: unknown
}

interface Ctx {
  selfRealizationDocs: DocumentReport[]
  postRealizationDocs: DocumentReport[]
  vibeCheckDocs: DocumentReport[]
}

export const appConfigSection: SectionSpec<WeMeditateAppStatusConfig, Ctx> = {
  key: 'appConfig',
  label: 'App Configuration',
  description:
    'Self-realization meditation, post-realization lecture, and vibe-check tracks are configured for this locale.',
  tutorialLink: null,
  checks: {
    'relationship-set': {
      label: 'Relationship set',
      description: 'A relationship value is assigned.',
    },
    'relationship-published': {
      label: 'Relationship published',
      description: 'The referenced document is published for this locale.',
    },
    present: {
      label: 'Present',
      description: "A row exists for this identifier in the locale's vibe-check track list.",
    },
    'audio-set': {
      label: 'Audio set',
      description: 'An audio file is assigned for this vibe-check track.',
    },
    'subtitles-set': {
      label: 'Subtitles set',
      description: 'A subtitles file is assigned for this vibe-check track.',
    },
  },
  prepare: async ({ payload, locale, req }) => {
    const appConfig = (await getWmAppConfig(payload, locale, 1, req)) as WmAppConfigSlice

    // Self-realization meditation — single 1-row group.
    const meditationRef = appConfig.selfRealizationMeditation
    const meditationRefSet = refId(meditationRef) !== null
    const meditationPublished = meditationMatchesLocale(meditationRef, locale)
    const selfRealizationDocs: DocumentReport[] = [
      {
        id: refId(meditationRef) ?? 'unset',
        label: meditationRefSet
          ? labelOf(meditationRef as { id: number | string; title?: unknown })
          : 'Not set',
        checks: [
          { key: 'relationship-set', passed: meditationRefSet },
          { key: 'relationship-published', passed: meditationPublished },
        ],
      },
    ]

    // Post-realization lecture — single 1-row group.
    const lectureRef = appConfig.postRealizationLecture
    const lectureRefSet = refId(lectureRef) !== null
    const postRealizationDocs: DocumentReport[] = [
      {
        id: refId(lectureRef) ?? 'unset',
        label: lectureRefSet
          ? labelOf(lectureRef as { id: number | string; title?: unknown })
          : 'Not set',
        checks: [{ key: 'relationship-set', passed: lectureRefSet }],
      },
    ]

    // Vibe-check tracks — one row per identifier.
    const tracks = Array.isArray(appConfig.vibeCheckTracks)
      ? (appConfig.vibeCheckTracks as Array<Record<string, unknown>>)
      : []
    const vibeCheckDocs: DocumentReport[] = VIBE_CHECK_IDENTIFIERS.map((id) => {
      const match = tracks.find((t) => t.identifier === id.value)
      return {
        id: id.value,
        label: id.label,
        checks: [
          { key: 'present', passed: !!match },
          { key: 'audio-set', passed: !!match && isUploadAssigned(match.audio) },
          { key: 'subtitles-set', passed: !!match && isUploadAssigned(match.subtitles) },
        ],
      }
    })

    return { selfRealizationDocs, postRealizationDocs, vibeCheckDocs }
  },
  groups: [
    {
      key: 'self-realization-meditation',
      label: 'Self-realization meditation',
      description: 'A published meditation is assigned for this locale.',
      type: 'documents',
      evaluate: async ({ selfRealizationDocs }) => selfRealizationDocs,
    },
    {
      key: 'post-realization-lecture',
      label: 'Post-realization lecture',
      description: 'A lecture is assigned for this locale.',
      type: 'documents',
      evaluate: async ({ postRealizationDocs }) => postRealizationDocs,
    },
    {
      key: 'vibe-check-tracks',
      label: 'Vibe-check tracks',
      description:
        'Every predefined vibe-check identifier has audio and subtitles uploaded for this locale.',
      type: 'documents',
      evaluate: async ({ vibeCheckDocs }) => vibeCheckDocs,
    },
  ],
}
