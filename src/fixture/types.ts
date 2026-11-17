import type { CollectionSlug, RequiredDataFromCollectionSlug } from 'payload'

import type { LocaleCode } from '@/lib/locales'

/** Payload's own bookkeeping collections, which no fixture writes. */
export type SystemSlug =
  'payload-kv' | 'payload-locked-documents' | 'payload-migrations' | 'payload-preferences'

export type FixtureSlug = Exclude<CollectionSlug, SystemSlug>

/** Every key optional at every depth; unknown and mistyped keys still fail `tsc`. */
type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

/**
 * A row's data, typed against `src/payload-types.ts`.
 *
 * Deep-partial because Payload demands on input the keys it fills itself
 * (`slug`, …) — the same reason `tests/utils/testData.ts` has `createData`. A
 * required key left out is refused by Payload at load, which turns CI red.
 */
export type FixtureData<S extends FixtureSlug> = DeepPartial<
  Omit<RequiredDataFromCollectionSlug<S>, 'id'>
>

export interface FixtureEntry<S extends FixtureSlug> {
  /** The row's id, ≥ 1,000,000 and written here, never derived — links are built from it. */
  id: number
  data: FixtureData<S>
  /** A file under `src/fixture/files/`, uploaded through the app. */
  file?: string
  /** Per-locale values, written after the create in that locale. */
  locales?: Partial<Record<LocaleCode, FixtureData<S>>>
  /**
   * Written beneath every hook with `payload.db`, for a state only a paid or
   * external path reaches (a Stream clip, a vendor's verdict). Says which.
   */
  direct?: string
}

export interface CollectionFixture<S extends FixtureSlug = FixtureSlug> {
  slug: S
  entries: FixtureEntry<S>[]
}

/** Declare one collection's fixture, typed to its slug. */
export const fixture = <S extends FixtureSlug>(
  slug: S,
  entries: FixtureEntry<S>[],
): CollectionFixture<S> => ({ slug, entries })

/** Every fixture id is at least this, and nothing else ever is. */
export const FIXTURE_ID_FLOOR = 1_000_000
