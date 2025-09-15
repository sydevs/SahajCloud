import { Validate } from 'payload'

export const validateCharacterCount = (limit: number): Validate => {
  return (value: unknown) => {
    if (!value) return true // Allow empty values

    if (typeof value !== 'string') {
      return 'Value must be a string'
    }

    // Strip HTML tags and entities for accurate character count
    const strippedText = value
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&[^;]+;/g, ' ') // Replace HTML entities with space
      .trim()

    if (strippedText.length > limit) {
      return `Text must not exceed ${limit} characters (currently ${strippedText.length})`
    }

    return true
  }
}