import type { CollectionConfig, Validate } from 'payload'

export const MeditationFrames: CollectionConfig = {
  slug: 'meditationFrames',
  admin: {
    hidden: true, // Hide from admin panel navigation
    useAsTitle: 'id', // Use the auto-generated ID as the title
  },
  fields: [
    {
      name: 'meditation',
      type: 'relationship',
      relationTo: 'meditations',
      required: true,
      index: true, // Index for performance on queries
    },
    {
      name: 'frame',
      type: 'relationship',
      relationTo: 'frames',
      required: true,
      index: true, // Index for performance on queries
    },
    {
      name: 'timestamp',
      type: 'number',
      min: 0,
      required: true,
      admin: {
        description: 'Timestamp in seconds - used for ordering frames within a meditation',
      },
      validate: (async (value, { req, data, siblingData }) => {
        if (typeof value !== 'number' || value < 0 || isNaN(value)) {
          return 'Timestamp must be a valid number greater than or equal to 0'
        }

        // Ensure timestamp uniqueness per meditation
        const meditationId = siblingData?.meditation || data?.meditation
        if (!meditationId) {
          return true // Let the required validation for meditation handle this
        }

        try {
          // Check for existing meditation-frame relationships with the same timestamp
          const existingFrames = await req.payload.find({
            collection: 'meditationFrames',
            where: {
              and: [
                {
                  meditation: {
                    equals: meditationId,
                  },
                },
                {
                  timestamp: {
                    equals: value,
                  },
                },
              ],
            },
            limit: 1, // Optimize: We only need to know if any exist
          })

          // If we're updating an existing record, exclude it from the uniqueness check
          const currentDocId = data?.id
          const conflictingFrames = currentDocId
            ? existingFrames.docs.filter(doc => doc.id !== currentDocId)
            : existingFrames.docs

          if (conflictingFrames.length > 0) {
            return `Timestamp ${value} seconds is already used in this meditation. Each timestamp must be unique per meditation.`
          }

          return true
        } catch (error) {
          req.payload.logger.error({
            msg: 'Error during timestamp uniqueness validation',
            err: error,
            timestamp: value,
            meditationId,
            operation: data?.id ? 'update' : 'create',
          })
          return 'Unable to validate timestamp uniqueness. Please try again.'
        }
      }) satisfies Validate,
    },
  ],
}