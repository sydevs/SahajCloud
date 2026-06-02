import type { CollectionBeforeChangeHook } from 'payload'

import { meditationFramesChanged } from '@/lib/meditations/frames'

export const invalidateMeditationNodeWeights: CollectionBeforeChangeHook = ({
  data,
  originalDoc,
}) => {
  const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(data, key)
  const framesChanged =
    hasOwn('frames') && meditationFramesChanged(originalDoc?.frames, data.frames)
  const durationChanged = hasOwn('duration') && data.duration !== originalDoc?.duration

  if (framesChanged || durationChanged) {
    data.subtleSystemNodeWeights = null
  }

  return data
}
