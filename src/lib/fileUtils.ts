import { PayloadRequest } from 'payload'
import sharp from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
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
      const { width, height, orientation } = await sharp(data).metadata()
      return {
        orientation,
        width,
        height,
      } as FileMetadata
    }
  }
}

const getMediaMetadata = (fileBuffer: Buffer) => {
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
