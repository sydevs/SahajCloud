import type { Suggestion } from './useFrameSuggestions'
import type { UIFieldServerComponent } from 'payload'

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { TranscriptView, type TranscriptFile } from './TranscriptView'

/**
 * The meditation's Transcript tab.
 *
 * ⚠ UI proposal only: the transcript and the frame suggestions are read from
 * committed files in `seeds/`, standing in for wherever they end up being
 * stored. Nothing here requests, stores or refreshes either.
 */
export const MeditationTranscript: UIFieldServerComponent = async ({ id, data, payload, req }) => {
  const [transcript, suggested] = id
    ? await Promise.all([
        readSeed<TranscriptFile>('meditation-transcripts', id),
        readSeed<{ suggestions: Omit<Suggestion, 'frame'>[] }>('frame-suggestions', id),
      ])
    : [null, null]

  const list = suggested?.suggestions ?? []
  const frames = list.length
    ? await payload.find({
        collection: 'frames',
        where: { id: { in: list.map((s) => s.frameId) } },
        depth: 1,
        pagination: false,
        req,
      })
    : null
  const byId = new Map(frames?.docs.map((frame) => [frame.id, frame]))
  const suggestions = list.flatMap((s) => {
    const frame = byId.get(s.frameId)
    return frame ? [{ ...s, frame }] : []
  })

  return (
    <TranscriptView
      outdated={Boolean(transcript && data?.filename !== transcript.audioFilename)}
      suggestions={suggestions}
      transcript={transcript}
    />
  )
}

async function readSeed<T>(folder: string, id: number | string): Promise<T | null> {
  const file = path.join(process.cwd(), 'seeds', folder, `${id}.json`)
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

export default MeditationTranscript
