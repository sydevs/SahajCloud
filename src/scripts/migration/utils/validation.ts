import type { Payload } from 'payload'

export class DataValidator {
  constructor(private payload: Payload) {}

  async validateTags(data: any): Promise<string | null> {
    if (!data.title) {
      return 'Missing required field: title'
    }

    if (typeof data.title === 'object') {
      if (!data.title.en) {
        return 'Missing required field: title.en'
      }
    } else if (typeof data.title !== 'string') {
      return 'Invalid title format'
    }

    return null
  }

  async validateMusic(data: any): Promise<string | null> {
    if (!data.title) {
      return 'Missing required field: title'
    }

    // Check if tags are valid IDs
    if (data.tags && Array.isArray(data.tags)) {
      for (const tagId of data.tags) {
        if (typeof tagId !== 'string') {
          return `Invalid tag ID: ${tagId}`
        }
      }
    }

    return null
  }

  async validateFrames(data: any): Promise<string | null> {
    if (!data.name) {
      return 'Missing required field: name'
    }

    if (!data.imageSet || !['male', 'female'].includes(data.imageSet)) {
      return 'Invalid or missing imageSet (must be "male" or "female")'
    }

    // Check if tags are valid IDs
    if (data.tags && Array.isArray(data.tags)) {
      for (const tagId of data.tags) {
        if (typeof tagId !== 'string') {
          return `Invalid tag ID: ${tagId}`
        }
      }
    }

    return null
  }

  async validateMeditations(data: any): Promise<string | null> {
    if (!data.title) {
      return 'Missing required field: title'
    }

    if (!data.locale || !['en', 'it'].includes(data.locale)) {
      return 'Invalid or missing locale (must be "en" or "it")'
    }

    if (!data.narrator) {
      return 'Missing required field: narrator'
    }

    // Validate frames structure
    if (data.frames && Array.isArray(data.frames)) {
      const timestamps = new Set<number>()
      
      for (let i = 0; i < data.frames.length; i++) {
        const frame = data.frames[i]
        
        if (!frame.frame || typeof frame.frame !== 'string') {
          return `Invalid frame ID at index ${i}`
        }
        
        if (typeof frame.timestamp !== 'number' || frame.timestamp < 0) {
          return `Invalid timestamp at index ${i}`
        }
        
        if (timestamps.has(frame.timestamp)) {
          return `Duplicate timestamp ${frame.timestamp} at index ${i}`
        }
        
        timestamps.add(frame.timestamp)
      }
    }

    // Check if tags are valid IDs
    if (data.tags && Array.isArray(data.tags)) {
      for (const tagId of data.tags) {
        if (typeof tagId !== 'string') {
          return `Invalid tag ID: ${tagId}`
        }
      }
    }

    return null
  }

  async validate(collection: string, data: any): Promise<string | null> {
    switch (collection) {
      case 'tags':
        return this.validateTags(data)
      case 'music':
        return this.validateMusic(data)
      case 'frames':
        return this.validateFrames(data)
      case 'meditations':
        return this.validateMeditations(data)
      default:
        return null
    }
  }

  async validateBatch(
    collection: string,
    dataArray: any[]
  ): Promise<Array<{ index: number; error: string }>> {
    const errors: Array<{ index: number; error: string }> = []

    for (let i = 0; i < dataArray.length; i++) {
      const error = await this.validate(collection, dataArray[i])
      if (error) {
        errors.push({ index: i, error })
      }
    }

    return errors
  }
}