/**
 * Reads `src/fixture/files/` rather than `tests/files/`, because the preview
 * fixture's own bytes are the subject: what a reviewer sees on each fixture
 * song is the duration asserted here.
 */
import fs from 'fs'
import path from 'path'

import { describe, expect, it, vi } from 'vitest'

import { extractAudioDuration, readAudioDuration } from '@/lib/audio/duration'

import { byteStream, cbrMp3WithoutInfoHeader } from '../utils/audioBytes'

const FIXTURE_FILES = path.join(process.cwd(), 'src', 'fixture', 'files')
const read = (name: string) => fs.readFileSync(path.join(FIXTURE_FILES, name))

/** `data` and `req` as a `beforeChange` hook receives them. */
const hookArgs = (file: { data: Buffer; mimetype?: string } | undefined, warn = vi.fn()) =>
  ({
    data: {} as Record<string, unknown>,
    req: { file: file && { ...file, name: 'song.mp3' }, payload: { logger: { warn } } },
  }) as never

describe('readAudioDuration', () => {
  it('reads whole seconds from an MP3', async () => {
    await expect(
      readAudioDuration({ buffer: read('fixture-audio.mp3'), mimeType: 'audio/mpeg' }),
    ).resolves.toBe(42)
  })

  it('tells two fixture songs apart, so a shared duration cannot pass as extraction', async () => {
    await expect(
      readAudioDuration({ buffer: read('fixture-audio-short.mp3'), mimeType: 'audio/mpeg' }),
    ).resolves.toBe(9)
  })

  it('answers undefined when the container states no duration', async () => {
    await expect(
      readAudioDuration({ buffer: read('fixture-audio-no-duration.mp3'), mimeType: 'audio/mpeg' }),
    ).resolves.toBeUndefined()
  })

  it('reads a constant-bitrate MP3 with no Info header from a stream told its size', async () => {
    const bytes = cbrMp3WithoutInfoHeader(3)

    await expect(
      readAudioDuration({ stream: byteStream(bytes), mimeType: 'audio/mpeg', size: bytes.length }),
    ).resolves.toBe(3)
    // The same bytes as a buffer, which carries its own size.
    await expect(readAudioDuration({ buffer: bytes, mimeType: 'audio/mpeg' })).resolves.toBe(3)
  })

  it('finds no duration in that stream when its size is not given', async () => {
    await expect(
      readAudioDuration({ stream: byteStream(cbrMp3WithoutInfoHeader(3)), mimeType: 'audio/mpeg' }),
    ).resolves.toBeUndefined()
  })

  it('throws when the bytes are not audio at all', async () => {
    await expect(readAudioDuration({ buffer: Buffer.from('not audio') })).rejects.toThrow()
  })
})

describe('extractAudioDuration', () => {
  it('stores the uploaded audio duration in whole seconds', async () => {
    const result = await extractAudioDuration()(
      hookArgs({ data: read('fixture-audio.mp3'), mimetype: 'audio/mpeg' }),
    )

    expect(result).toEqual({ duration: 42 })
  })

  it('accepts audio inside the cap', async () => {
    const result = await extractAudioDuration({ maxMinutes: 0.5 })(
      hookArgs({ data: read('fixture-audio-short.mp3'), mimetype: 'audio/mpeg' }),
    )

    expect(result).toEqual({ duration: 9 })
  })

  // The no-cap case stores this same file, which is what Songs mounts.
  it('refuses audio longer than the cap', async () => {
    await expect(
      extractAudioDuration({ maxMinutes: 0.5 })(
        hookArgs({ data: read('fixture-audio.mp3'), mimetype: 'audio/mpeg' }),
      ),
    ).rejects.toThrow(/exceeds maximum/)
  })

  it('warns and stores nothing when the bytes cannot be parsed', async () => {
    const warn = vi.fn()

    const result = await extractAudioDuration()(hookArgs({ data: Buffer.from('not audio') }, warn))

    expect(result).toEqual({})
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'Failed to extract audio duration' }),
    )
  })

  it('stores nothing, and warns about nothing, when the audio states no duration', async () => {
    const warn = vi.fn()

    const result = await extractAudioDuration()(
      hookArgs({ data: read('fixture-audio-no-duration.mp3'), mimetype: 'audio/mpeg' }, warn),
    )

    expect(result).toEqual({})
    expect(warn).not.toHaveBeenCalled()
  })

  it('leaves a save carrying no file alone', async () => {
    expect(await extractAudioDuration()(hookArgs(undefined))).toEqual({})
  })
})
