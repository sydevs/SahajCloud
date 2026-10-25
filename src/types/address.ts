import type { Event } from '@/payload-types'

/**
 * The stored `event.address` group, with the field's own `undefined` stripped.
 *
 * Exported because two modules read the shape — the factory that builds the
 * group, and the notification that renders it on one line. Deriving it a third
 * time beside a consumer is the restatement `EventSchedule` exists to prevent
 * (#671).
 */
export type EventAddress = NonNullable<Event['address']>
