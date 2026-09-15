import { screeningKickHook } from '@/lib/jobs/screeningKick'

/**
 * afterChange (create): queue screening for a fresh submission.
 *
 * The guard, the deferred kick and the autoRun safety net behind it all live in
 * `screeningKickHook`, shared with the two collections this one replaces.
 */
export const enqueueSubmissionScreening = screeningKickHook({
  ready: 'pending',
  label: 'enqueueSubmissionScreening',
  queue: ({ doc, req }) =>
    req.payload.jobs.queue({
      task: 'screenSubmission',
      input: { submissionId: doc.id },
      queue: 'screening',
      req,
    }),
})
