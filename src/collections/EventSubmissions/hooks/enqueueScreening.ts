import { screeningKickHook } from '@/lib/jobs/screeningKick'

/**
 * afterChange (create): queue the async screening task for a fresh submission.
 *
 * The guard, the deferred kick and the autoRun safety net behind it all live in
 * `screeningKickHook`, shared with `user-messages` and `user-submissions`.
 */
export const enqueueScreening = screeningKickHook({
  ready: 'screening',
  label: 'enqueueScreening',
  queue: ({ doc, req }) =>
    req.payload.jobs.queue({
      task: 'screenEventSubmission',
      input: { submissionId: doc.id },
      queue: 'screening',
      req,
    }),
})
