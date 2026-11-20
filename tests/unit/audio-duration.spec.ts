/**
 * Reads `src/fixture/files/` rather than `tests/files/`, because the preview
 * fixture's own bytes are the subject: what a reviewer sees on each fixture
 * song is the duration asserted here.
 */
import fs from 'fs'
import path from 'path'

import { describe, expect, it, vi } from 'vitest'

import { extractAudioDuration } from '@/lib/audio/duration'

const FIXTURE_FILES = path.join(process.cwd(), 'src', 'fixture', 'files')
const read = (name: string) => fs.readFileSync(path.join(FIXTURE_FILES, name))

/**
 * `seconds` of constant-bitrate MP3 carrying no Xing or Info header — the
 * shape of most songs uploaded before #1202. Its length is stated only as size
 * over bitrate (#1210).
 *
 * Built rather than stored: each frame is an MPEG-1 Layer III header (32 kbps,
 * 48 kHz, no padding — 96 bytes, 24 ms) followed by silence.
 */
const cbrMp3WithoutInfoHeader = (seconds: number): Buffer => {
  const frame = Buffer.alloc(96)
  frame.writeUInt32BE(0xfffb1400, 0)
  return Buffer.concat(Array<Buffer>(Math.round(seconds / 0.024)).fill(frame))
}

/** `data` and `req` as a `beforeChange` hook receives them. */
const hookArgs = (file: { data: Buffer; mimetype?: string } | undefined, warn = vi.fn()) =>
  ({
    data: {} as Record<string, unknown>,
    req: { file: file && { ...file, name: 'song.mp3' }, payload: { logger: { warn } } },
  }) as never

describe('extractAudioDuration', () => {
  it('stores the uploaded audio duration in whole seconds', async () => {
    const result = await extractAudioDuration()(
      hookArgs({ data: read('fixture-audio.mp3'), mimetype: 'audio/mpeg' }),
    )

    expect(result).toEqual({ duration: 42 })
  })

  // A buffer carries its own size, the only way this file states its length.
  // Parsing the upload as a stream with no size would store nothing here.
  it('stores the duration of a constant-bitrate MP3 with no Info header', async () => {
    const result = await extractAudioDuration()(
      hookArgs({ data: cbrMp3WithoutInfoHeader(3), mimetype: 'audio/mpeg' }),
    )

    expect(result).toEqual({ duration: 3 })
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
