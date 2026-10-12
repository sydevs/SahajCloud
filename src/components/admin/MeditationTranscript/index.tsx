import type { UIFieldServerComponent } from 'payload'

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { TranscriptView, type TranscriptFile } from './TranscriptView'

/**
 * The meditation's Transcript tab.
 *
 * ⚠ UI proposal only: the transcript is read from the committed file in
 * `seeds/meditation-transcripts/`, standing in for wherever transcripts end up
 * being stored. Nothing here requests, stores or refreshes a transcript.
 */
export const MeditationTranscript: UIFieldServerComponent = async ({ id, data }) => {
  const transcript = id ? await readTranscript(id) : null
  return (
    <TranscriptView
      outdated={Boolean(transcript && data?.filename !== transcript.audioFilename)}
      transcript={transcript}
    />
  )
}

async function readTranscript(id: number | string): Promise<TranscriptFile | null> {
  const file = path.join(process.cwd(), 'seeds/meditation-transcripts', `${id}.json`)
  try {
    return JSON.parse(await readFile(file, 'utf8')) as TranscriptFile
  } catch {
    return null
  }
}

export default MeditationTranscript
