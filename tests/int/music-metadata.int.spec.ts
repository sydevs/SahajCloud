import fs from 'fs'
import path from 'path'

import { parseBuffer } from 'music-metadata'
import { describe, it, expect } from 'vitest'

const SAMPLE_FILES_DIR = path.resolve(__dirname, '../files')

describe('music-metadata library', () => {
  it('extracts duration from MP3 file', async () => {
    const filePath = path.join(SAMPLE_FILES_DIR, 'audio-42s.mp3')
    const buffer = fs.readFileSync(filePath)

    const metadata = await parseBuffer(buffer, { mimeType: 'audio/mpeg' })

    expect(metadata.format.duration).toBeDefined()
    // audio-42s.mp3 is approximately 42 seconds
    expect(metadata.format.duration).toBeGreaterThan(40)
    expect(metadata.format.duration).toBeLessThan(44)
  })

  it('extracts duration from WAV file', async () => {
    const filePath = path.join(SAMPLE_FILES_DIR, 'audio-5s.wav')
    const buffer = fs.readFileSync(filePath)

    const metadata = await parseBuffer(buffer, { mimeType: 'audio/wav' })

    expect(metadata.format.duration).toBeDefined()
    expect(metadata.format.duration).toBeGreaterThan(4)
    expect(metadata.format.duration).toBeLessThan(6)
  })
})
