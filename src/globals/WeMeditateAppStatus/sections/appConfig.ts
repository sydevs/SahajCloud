import type { BasePayload, PayloadRequest } from 'payload'

import { VIBE_CHECK_IDENTIFIERS } from '@/globals/WeMeditateAppConfig/WeMeditateAppConfig'
import {
  isUploadAssigned,
  labelOf,
  refId,
  type DocumentReport,
  type SectionSpec,
} from '@/lib/status'
import { isRecord } from '@/lib/utilities/isRecord'

import {
  getWmAppConfig,
  isolatedReq,
  meditationMatchesLocale,
  type WeMeditateAppStatusConfig,
} from './shared'

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

/**
 * Whether a configured reference still resolves. Payload populates a trashed
 * document whole, `_status` included, so a slot pointing into the trash reads
 * as ready while the app cannot read the document at all (#1252). Only a read
 * that excludes the trash tells the two apart.
 */
async function refIsLive(
  payload: BasePayload,
  collection: 'lectures' | 'meditations',
  ref: unknown,
  req?: PayloadRequest,
): Promise<boolean> {
  const id = refId(ref)
  if (id === null) return false
  const { docs } = await payload.find({
    collection,
    where: { id: { equals: id } },
    limit: 1,
    pagination: false,
    depth: 0,
    req: isolatedReq(req),
  })
  return docs.length > 0
}

/**
 * Name a configured relationship's row. A row nothing resolves to fails every
 * check, as the pages section's does; only the label and a sentinel id say
 * whether the slot is empty or names a document that is gone.
 */
function slotIdentity(
  ref: unknown,
  live: boolean,
  key: string,
  noun: string,
): { id: number | string; label: string; live: boolean } {
  const id = refId(ref)
  if (live && id !== null) {
    return { id, label: labelOf(isRecord(ref) ? { ...ref, id } : { id }), live }
  }
  return {
    id: id === null ? 'unset' : `missing:${key}`,
    label: id === null ? 'Not set' : `${noun} ${id} not found`,
    live: false,
  }
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
    const meditationRef = appConfig.selfRealizationMeditation
    const lectureRef = appConfig.postRealizationLecture
    const [meditationLive, lectureLive] = await Promise.all([
      refIsLive(payload, 'meditations', meditationRef, req),
      refIsLive(payload, 'lectures', lectureRef, req),
    ])

    // Self-realization meditation — single 1-row group.
    const meditation = slotIdentity(
      meditationRef,
      meditationLive,
      'selfRealizationMeditation',
      'Meditation',
    )
    const selfRealizationDocs: DocumentReport[] = [
      {
        id: meditation.id,
        label: meditation.label,
        checks: [
          { key: 'relationship-set', passed: meditation.live },
          {
            key: 'relationship-published',
            passed: meditation.live && meditationMatchesLocale(meditationRef, locale),
          },
        ],
      },
    ]

    // Post-realization lecture — single 1-row group.
    const lecture = slotIdentity(lectureRef, lectureLive, 'postRealizationLecture', 'Lecture')
    const postRealizationDocs: DocumentReport[] = [
      {
        id: lecture.id,
        label: lecture.label,
        checks: [{ key: 'relationship-set', passed: lecture.live }],
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
