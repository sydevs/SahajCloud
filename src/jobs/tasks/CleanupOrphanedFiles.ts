import type { TaskConfig } from 'payload'

export const CleanupOrphanedFiles: TaskConfig<'cleanupOrphanedFiles'> = {
  retries: 2,
  label: 'Cleanup Orphaned File Attachments',
  slug: 'cleanupOrphanedFiles',
  inputSchema: [],
  outputSchema: [
    {
      name: 'deletedCount',
      type: 'number',
      required: true,
    },
    {
      name: 'skippedCount',
      type: 'number',
      required: true,
    },
  ],
  schedule: [
    {
      cron: '0 0 1 * *', // First day of every month at midnight
      queue: 'monthly',
    },
  ],
  handler: async ({ req }) => {
    const maxDeletions = 1000
    const gracePeriodHours = 24

    // Calculate cutoff time (24 hours ago)
    const cutoffTime = new Date()
    cutoffTime.setHours(cutoffTime.getHours() - gracePeriodHours)

    req.payload.logger.info({
      msg: 'Starting orphaned file attachment cleanup',
      cutoffTime: cutoffTime.toISOString(),
      maxDeletions,
      gracePeriodHours,
    })

    let deletedCount = 0
    let skippedCount = 0

    try {
      // Find FileAttachments older than 24 hours with potential orphan conditions
      const orphanedFiles = await req.payload.find({
        collection: 'files',
        where: {
          createdAt: {
            less_than: cutoffTime.toISOString(),
          },
        },
        limit: maxDeletions + 100, // Get a bit more to account for validation
        depth: 0, // Don't populate relationships to avoid type issues
      })

      req.payload.logger.info({
        msg: `Found ${orphanedFiles.docs.length} file attachments older than ${gracePeriodHours} hours`,
      })

      for (const fileAttachment of orphanedFiles.docs) {
        // Stop if we've reached the deletion limit
        if (deletedCount >= maxDeletions) {
          req.payload.logger.info({ msg: `Reached maximum deletion limit of ${maxDeletions}, stopping cleanup` })
          break
        }

        let shouldDelete = false
        let reason = ''

        // Check if file has no owner (null or undefined)
        if (!fileAttachment.owner || !fileAttachment.owner.value) {
          shouldDelete = true
          reason = 'No owner assigned'
        } else {
          // Check if the owner relationship points to a non-existent document
          try {
            // Extract ID from the owner value (could be number, string, or populated object)
            const ownerValue = fileAttachment.owner.value
            const ownerId = typeof ownerValue === 'number'
              ? String(ownerValue)
              : typeof ownerValue === 'string'
                ? ownerValue
                : String(ownerValue.id)

            const ownerExists = await req.payload.findByID({
              collection: fileAttachment.owner.relationTo,
              id: ownerId,
              depth: 0, // Just check existence, don't need full data
            })

            if (!ownerExists) {
              shouldDelete = true
              reason = `Owner ${fileAttachment.owner.relationTo}:${ownerId} does not exist`
            }
          } catch (error) {
            // If findByID throws an error, the document doesn't exist
            shouldDelete = true
            const ownerValue = fileAttachment.owner.value
            const ownerId = typeof ownerValue === 'number'
              ? String(ownerValue)
              : typeof ownerValue === 'string'
                ? ownerValue
                : String(ownerValue.id)
            const errorMessage = error instanceof Error ? error.message : String(error)
            reason = `Owner ${fileAttachment.owner.relationTo}:${ownerId} does not exist (error: ${errorMessage})`
          }
        }

        if (shouldDelete) {
          try {
            await req.payload.delete({
              collection: 'files',
              id: fileAttachment.id,
            })

            deletedCount++
            req.payload.logger.info({
              msg: `Deleted orphaned file attachment ${fileAttachment.id}`,
              filename: fileAttachment.filename,
              reason,
              createdAt: fileAttachment.createdAt,
            })
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            req.payload.logger.error({
              msg: `Failed to delete file attachment ${fileAttachment.id}`,
              filename: fileAttachment.filename,
              error: errorMessage,
              reason,
            })
            skippedCount++
          }
        } else {
          skippedCount++
        }
      }

      req.payload.logger.info({
        msg: 'Orphaned file attachment cleanup completed',
        deletedCount,
        skippedCount,
        totalProcessed: deletedCount + skippedCount,
      })

      return {
        output: {
          deletedCount,
          skippedCount,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      req.payload.logger.error({
        msg: 'Error during orphaned file attachment cleanup',
        error: errorMessage,
        deletedCount,
        skippedCount,
      })

      // Re-throw the error to mark the job as failed
      throw error
    }
  },
}