/**
 * `pnpm seed file-transcripts` — ask for a transcript of every audio and video
 * file that has none (#1016).
 *
 * Uploads are transcribed as they are saved from #1016 on, so this is the
 * one-off for files uploaded before it: about 40 short vibe-check prompts and a
 * handful of panel videos in production when it shipped. The 28 Path Step
 * intro recordings are not among them — the migration carried their hand-made
 * cues into transcripts.
 *
 * Each missing transcript is created the way an upload creates one
 * (`syncRecordingTranscript`), so its run is queued and started by the
 * transcript's own hook, on the target's own server and with its own vendor key.
 * Re-running finds nothing left to do. `--dry-run` counts the files and stops.
 *
 * ⚠ Each run costs a Lemonfox call, which is why this is never in the seed
 * order and runs only by name.
 */
import path from 'path'

import { createLocalReq } from 'payload'
import { extractID } from 'payload/shared'

import { transcribableMedia } from '@/lib/transcripts/media'
import { syncRecordingTranscript } from '@/lib/transcripts/sync'

import { BaseImporter, type BaseImportOptions } from '../lib'

export class FileTranscriptsImporter extends BaseImporter<BaseImportOptions> {
  protected readonly importName = 'File transcripts'
  protected readonly cacheDir = path.resolve(process.cwd(), 'seeds/cache/file-transcripts')

  /** To the operator's terminal as well as the server log. */
  private async say(message: string): Promise<void> {
    await this.logger.info(message)
    await this.sendEvent({ type: 'info', message })
  }

  protected async import(): Promise<void> {
    if (!this.payload) {
      throw new Error('file-transcripts runs against a target; it has nothing to do offline')
    }

    const { docs: files } = await this.payload.find({
      collection: 'files',
      where: {
        or: [{ mimeType: { equals: 'audio/mpeg' } }, { mimeType: { like: 'video/' } }],
      },
      select: { filename: true, mimeType: true },
      depth: 0,
      limit: 0,
      pagination: false,
      overrideAccess: true,
    })
    const { docs: transcripts } = await this.payload.find({
      collection: 'transcripts',
      select: { source: true },
      depth: 0,
      limit: 0,
      pagination: false,
      overrideAccess: true,
    })
    const transcribed = new Set(
      transcripts
        .filter((row) => row.source?.relationTo === 'files')
        .map((row) => extractID(row.source.value)),
    )
    const missing = files.filter(
      (file) => file.filename && transcribableMedia(file.mimeType) && !transcribed.has(file.id),
    )

    await this.say(`${files.length} audio and video files, ${missing.length} without a transcript.`)
    if (this.options.dryRun) {
      await this.say('Dry run — nothing queued. Run without --dry-run to transcribe them.')
      return
    }

    const req = await createLocalReq({}, this.payload)
    for (const [index, file] of missing.entries()) {
      const identifier = `${file.id} (${file.filename})`
      try {
        await syncRecordingTranscript(req, {
          source: { relationTo: 'files', value: file.id },
          audioFilename: file.filename!,
          language: null,
        })
        this.report.incrementCreated()
        await this.reportDocument('transcripts', identifier, 'created', {
          current: index + 1,
          total: missing.length,
        })
      } catch (error) {
        this.addError(`Queueing a transcript for file ${identifier}`, error as Error)
      }
    }
  }
}

export default FileTranscriptsImporter
