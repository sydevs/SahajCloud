/**
 * Tag Type Definitions
 *
 * Reusable type definitions for inline enum select fields on content collections.
 * These types are derived from the generated payload-types.ts to ensure type safety.
 */

import type { Image, Page, Video } from '@/payload-types'

/** Image tag enum values (inline strings from Images collection) */
export type ImageTag = NonNullable<NonNullable<Image['tags']>[number]>

/** Page tag enum values (inline strings from Pages collection) */
export type PageTag = NonNullable<NonNullable<Page['tags']>[number]>

/** Video tag enum values (inline strings from Videos collection) */
export type VideoTag = NonNullable<NonNullable<Video['tags']>[number]>
