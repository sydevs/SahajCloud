import { screeningKickHook } from '@/lib/jobs/screeningKick'

/**
 * afterChange (create): queue the async screening task for a fresh message.
 *
 * The guard, the deferred kick and the autoRun safety net behind it all live in
 * `screeningKickHook`, shared with `event-submissions` and `user-submissions`.
 */
export const enqueueUserMessageScreening = screeningKickHook({
  ready: 'screening',
  label: 'enqueueUserMessageScreening',
  queue: ({ doc, req }) =>
    req.payload.jobs.queue({
      task: 'screenUserMessage',
      input: { messageId: doc.id },
      queue: 'screening',
      req,
    }),
})
