import type { PayloadRequest, TaskConfig } from 'payload'

import { extractID } from 'payload/shared'

import { ExpectedJobFailure } from '@/lib/jobs/expectedFailure'
import { localeForLemonfoxLanguage } from '@/lib/lemonfox/languages'
import { lemonfoxDetectedLanguage, normalizeLemonfoxCues } from '@/lib/lemonfox/normalize'
import type { LocaleCode } from '@/lib/locales'
import { transcribableMedia } from '@/lib/transcripts/media'
import { transcriptHasCues } from '@/lib/transcripts/read'
import { findTranscript, type TranscriptSource } from '@/lib/transcripts/sync'
import { originOf } from '@/lib/utilities/url'
import type { Transcript } from '@/payload-types'
import { getCloudflareStreamMp4Url, getR2Url } from '@/plugins/storage'
import { isProductionDeployment } from '@/plugins/storage/previewIsolation'

import {
  lemonfoxApiKey,
  requestLemonfoxTranscript,
  TRANSCRIPTION_UNAVAILABLE_ERROR,
} from './lemonfoxClient'

/**
 * A missing key or bucket URL is the deployment's gap, not the recording's: an
 * answer on a preview or locally, where nothing configures them, and an outage
 * in production, where it must alert.
 */
const configGap = (message: string): Error =>
  isProductionDeployment() ? new Error(message) : new ExpectedJobFailure(message)

/** How long a Stream video's MP4 download may take to appear before the run gives up. */
const VIDEO_READY_ATTEMPTS = 6
const VIDEO_READY_INTERVAL_MS = 20 * 1000

/** The recording a run fetches, and the language it is asked for when one is known. */
type Recording = {
  filename: string
  audioUrl: string | undefined
  language: LocaleCode | null
  /** A Stream upload, whose MP4 download may not exist yet. */
  isStreamVideo: boolean
}

/**
 * Transcribe one recording — a meditation or a `files` row — into `transcripts`.
 *
 * Queued by the transcript row's own afterChange, which also starts the
 * `transcription` queue. That queue's autoRun only picks up a run the start
 * lost.
 *
 * ⚠ **The slug is still `transcribeMeditation`.** It is a Postgres enum value on
 * `payload_jobs`, and retained job rows carry it, so renaming it is an enum
 * rebuild (`src/migrations/AGENTS.md`) for a label. The task has served files
 * too since #1016.
 *
 * ⚠ **Every write checks the row is still this run's own.** The audio can be
 * replaced, and the transcript can be asked for again in another language, while
 * this run waits on Lemonfox. Each request gets a fresh row naming its own job,
 * so the row's `job` is what tells one request from the next — the filename
 * cannot, since a retry of the same recording carries the same one.
 *
 * ⚠ **A failure throws, and nothing catches it.** `retries: 0`, so the throw
 * ends the run and the retained job row carries the message — which is where
 * the transcript's `status` and `error` are read from. Catching one into a
 * column would be a second statement of the same failure.
 *
 * ⚠ **No `concurrency` key, on purpose.** Payload holds back every job whose key
 * matches a job still marked `processing`, and a run lost to a restart keeps
 * that flag forever — so a key would block a re-request after a stall, for
 * good. The row checks above stop duplicate writes.
 *
 * **A file's language is detected unless its row names one.** A file has no
 * language of its own, so the first run asks for none and stores the language
 * Lemonfox reports; an editor who corrects it asks for a run in that language
 * (#1016). The glossary pass then keys on whichever was stored.
 */
export const TranscribeRecording: TaskConfig<'transcribeMeditation'> = {
  slug: 'transcribeMeditation',
  label: 'Transcribe Recording',
  retries: 0,
  inputSchema: [
    // Exactly one of the two. `meditationId` keeps its name so a run queued
    // before #1016 still reads.
    { name: 'meditationId', type: 'number' },
    { name: 'fileId', type: 'number' },
    { name: 'audioFilename', type: 'text', required: true },
  ],
  outputSchema: [{ name: 'status', type: 'text', required: true }],
  handler: async ({ input, job, req }) => {
    const { audioFilename } = input
    const source = sourceOf(input)

    // Neither read feeds the other, and both have to pass before the vendor
    // call.
    const [row, recording] = await Promise.all([
      findCurrentRow(req, source, job.id),
      findRecording(req, source),
    ])
    // The recording was replaced, which deleted this row. Nothing to write, and
    // nothing wrong: the replacement queued its own run.
    if (!row) return { output: { status: 'superseded' } }
    if (transcriptHasCues(row)) return { output: { status: 'completed' } }

    if (recording?.filename !== audioFilename) {
      throw new ExpectedJobFailure('The recording was replaced while it was being transcribed.')
    }

    const apiKey = lemonfoxApiKey()
    if (!apiKey) throw configGap(TRANSCRIPTION_UNAVAILABLE_ERROR)

    // ⚠ **An absolute URL, not merely a non-empty one.** The vendor fetches it
    // itself, and with no Cloudflare credentials a file's `url` is the relative
    // `/api/files/file/<name>` (`storage/urlFields.ts`).
    const { audioUrl } = recording
    if (!audioUrl || !originOf(audioUrl)) {
      throw configGap('This recording has no public URL, so Lemonfox cannot fetch it.')
    }
    if (recording.isStreamVideo) await waitForVideoDownload(audioUrl)

    // The row's language wins: it is a correction, or a meditation's own.
    const askedFor = (row.language as LocaleCode | null | undefined) ?? recording.language
    const body = await requestLemonfoxTranscript({
      apiKey,
      audioUrl,
      locale: askedFor ?? undefined,
      wordTimings: true,
    })
    const segments = normalizeLemonfoxCues(body)
    const language = askedFor ?? localeForLemonfoxLanguage(lemonfoxDetectedLanguage(body)) ?? null

    // ⚠ **By id, not by truthiness.** A corrected language replaces the row
    // and keeps this job's id nowhere, so the row read back must also be the
    // one read above — the update below would otherwise throw on a deleted
    // document instead of answering `superseded`.
    const current = await findCurrentRow(req, source, job.id)
    if (current?.id !== row.id) {
      return { output: { status: 'superseded' } }
    }

    await req.payload.update({
      collection: 'transcripts',
      id: row.id,
      data: { provider: 'lemonfox', segments, language },
      depth: 0,
      overrideAccess: true,
      req,
    })
    return { output: { status: 'completed' } }
  },
}

function sourceOf(input: { meditationId?: number | null; fileId?: number | null }) {
  if (input.fileId) return { relationTo: 'files', value: input.fileId } as const
  if (input.meditationId) return { relationTo: 'meditations', value: input.meditationId } as const
  throw new Error('A transcription run names neither a meditation nor a file.')
}

/**
 * Wait for Stream's MP4 download to answer, or give up with a reason.
 *
 * The webhook that queues a video's run is the one that *enables* downloads, and
 * Stream builds the MP4 after that — seconds for a short clip, longer for a big
 * one. Giving up is an answer, not an outage: the panel offers a retry.
 */
async function waitForVideoDownload(url: string): Promise<void> {
  for (let attempt = 1; attempt <= VIDEO_READY_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, { method: 'HEAD' }).catch(() => null)
    if (response?.ok) return
    if (attempt < VIDEO_READY_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, VIDEO_READY_INTERVAL_MS))
    }
  }
  throw new ExpectedJobFailure(
    'Cloudflare Stream has not finished preparing this video yet. Try again in a few minutes.',
  )
}

/**
 * The recording's transcript row, while it is still the one this run was queued
 * for.
 *
 * The owner is a field comparison rather than a second query. A row naming
 * another job belongs to a later request: `POST :id/transcribe` deletes and
 * re-creates the row, so the id moves on even when the recording does not.
 */
async function findCurrentRow(
  req: PayloadRequest,
  source: TranscriptSource,
  jobId: number | string,
): Promise<Transcript | undefined> {
  const row = await findTranscript(req, source)
  return row?.job && extractID(row.job) === jobId ? row : undefined
}

/**
 * The recording this run has to match, where to fetch it, and the language it
 * is in when the recording itself says so.
 *
 * A meditation is read as its latest **draft**: the editor hears and places
 * frames against the draft's audio, so that is the recording a transcript must
 * match. A file states no language — the run detects it.
 */
async function findRecording(
  req: PayloadRequest,
  source: TranscriptSource,
): Promise<Recording | null> {
  if (source.relationTo === 'meditations') {
    const meditation = await req.payload.findByID({
      collection: 'meditations',
      id: source.value,
      depth: 0,
      draft: true,
      select: { filename: true, locale: true },
      overrideAccess: true,
      disableErrors: true,
      req,
    })
    if (!meditation?.filename) return null
    return {
      filename: meditation.filename,
      audioUrl: getR2Url(meditation.filename),
      language: meditation.locale,
      isStreamVideo: false,
    }
  }

  const file = await req.payload.findByID({
    collection: 'files',
    id: source.value,
    depth: 0,
    select: { filename: true, mimeType: true },
    overrideAccess: true,
    disableErrors: true,
    req,
  })
  if (!file?.filename) return null
  const media = transcribableMedia(file.mimeType)
  if (!media) {
    throw new ExpectedJobFailure('Only audio and video files can be transcribed.')
  }
  return {
    filename: file.filename,
    audioUrl:
      media === 'video' ? getCloudflareStreamMp4Url(file.filename) : getR2Url(file.filename),
    language: null,
    isStreamVideo: media === 'video',
  }
}
