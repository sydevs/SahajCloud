import type { ConversionContext } from '../../seeds/lib/lexicalConverter'
import type { Logger } from '../../seeds/lib/logger'
import type { Payload } from 'payload'

import { vi } from 'vitest'

/**
 * A `ConversionContext` for the unit lane, where the EditorJS → Lexical
 * converters run with no Payload instance.
 *
 * Every id map starts empty: a converter resolves a relationship through one, so
 * a spec passes the single map its case needs and leaves the rest to report the
 * miss they would report in a real import.
 */
export function makeConversionContext(
  overrides: Partial<ConversionContext> = {},
): ConversionContext {
  return {
    payload: {} as Payload,
    logger: makeLogger(),
    pageId: 42,
    pageTitle: 'Test Page',
    locale: 'en',
    mediaMap: new Map(),
    formMap: new Map(),
    lectureMap: new Map(),
    treatmentMap: new Map(),
    treatmentThumbnailMap: new Map(),
    meditationTitleMap: new Map(),
    meditationRailsTitleMap: new Map(),
    ...overrides,
  }
}

/** Spies for all six of `Logger`'s methods, so a spec can assert what was logged. */
export function makeLogger(): Logger {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    skip: vi.fn(),
  }
}
