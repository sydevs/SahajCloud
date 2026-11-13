import type { Region } from '@/payload-types'

/**
 * The region levels an event may attach to. `events.region` narrows both its
 * picker and its validator to these, so a node above them can hold no event —
 * which is why the Regions Events tab is hidden there.
 */
export const EVENT_REGION_LEVELS: readonly Region['level'][] = ['city', 'venue']
