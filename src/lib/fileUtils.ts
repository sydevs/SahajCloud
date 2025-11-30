import fs from 'fs'
import path from 'path'

import ffmpeg from 'fluent-ffmpeg'
import { PayloadRequest } from 'payload'
// import sharp from 'sharp' // DISABLED: Incompatible with Cloudflare Workers - TODO: Migrate to Cloudflare Images (Phase 6)
import tmp from 'tmp'


export type FileMetadata = {
  width?: number
  height?: number
  duration?: number
  orientation?: number
}

export const extractFileMetadata = async (file: NonNullable<PayloadRequest['file']>) => {
  const { data, mimetype } = file

  if (data && mimetype) {
    if (mimetype.startsWith('video/') || mimetype.startsWith('audio/')) {
      return getMediaMetadata(data)
    } else if (mimetype.startsWith('image/')) {
      // DISABLED: Sharp processing removed for Cloudflare Workers compatibility
      // Image metadata extraction will be handled by Cloudflare Images API in Phase 6
      return {} as FileMetadata
    }
  }
}

const getMediaMetadata = (fileBuffer: Buffer | Uint8Array) => {
  const { fd, name } = tmp.fileSync()

  // Get metadata using fluent-ffmpeg's ffprobe
  return new Promise<FileMetadata>((resolve, reject) => {
    // Write buffer to temporary file
    fs.writeFileSync(fd, fileBuffer)

    ffmpeg.ffprobe(name, (err, metadata) => {
      if (err) {
        reject(err)
        return
      }

      // Extract duration from metadata
      let duration = metadata.format?.duration || 0
      duration = parseFloat(duration.toFixed(1))

      // extract dimensions from metadata
      const videoStream = metadata.streams.find((stream) => stream.codec_type === 'video')

      if (videoStream && videoStream.width && videoStream.height) {
        resolve({
          duration,
          width: parseInt(videoStream.width.toString()),
          height: parseInt(videoStream.height.toString()),
        })
      } else {
        resolve({ duration })
      }
    })
  })
}

/**
 * Extract video thumbnail - DISABLED for Cloudflare Workers compatibility
 *
 * This function is temporarily disabled because it uses Sharp library which requires
 * native binaries and multi-threading not supported in Cloudflare Workers runtime.
 *
 * TODO: Migrate to Cloudflare Stream API or Cloudflare Images API in Phase 6
 */
export const extractVideoThumbnail = async (videoBuffer: Buffer | Uint8Array): Promise<Buffer> => {
  throw new Error(
    'Video thumbnail extraction is disabled for Cloudflare Workers compatibility. ' +
      'Will be migrated to Cloudflare Stream/Images API in Phase 6.',
  )
}

/*
// ORIGINAL IMPLEMENTATION - Commented out for Cloudflare Workers compatibility
export const extractVideoThumbnail = async (videoBuffer: Buffer | Uint8Array): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const inputFile = tmp.fileSync({ postfix: '.mp4' })
    const outputFile = tmp.fileSync({ postfix: '.png' })

    try {
      fs.writeFileSync(inputFile.fd, videoBuffer)

      ffmpeg(inputFile.name)
        .on('end', async () => {
          try {
            const thumbnailBuffer = await sharp(outputFile.name)
              .resize(320, 320, { fit: 'cover' })
              .webp({ quality: 95 })
              .toBuffer()

            inputFile.removeCallback()
            outputFile.removeCallback()
            resolve(thumbnailBuffer)
          } catch (error) {
            inputFile.removeCallback()
            outputFile.removeCallback()
            reject(error)
          }
        })
        .on('error', (err) => {
          inputFile.removeCallback()
          outputFile.removeCallback()
          reject(err)
        })
        .screenshots({
          timestamps: [0.1],
          filename: path.basename(outputFile.name),
          folder: path.dirname(outputFile.name),
          size: '320x320',
        })
    } catch (error) {
      inputFile.removeCallback()
      outputFile.removeCallback()
      reject(error)
    }
  })
}
*/
