/**
 * `transcriptSpeaksLocale` — the one rule behind the editor's mismatch warning
 * and `intro-subtitles-set` (#1016). Two surfaces read it, so the cases that
 * matter are the ones where "unknown" and "wrong" could be confused.
 */
import { describe, expect, it } from 'vitest'

import { transcriptSpeaksLocale } from '@/lib/transcripts/language'

describe('transcriptSpeaksLocale', () => {
  it('accepts the same language', () => {
    expect(transcriptSpeaksLocale('cs', 'cs')).toBe(true)
  })

  it('refuses another language', () => {
    expect(transcriptSpeaksLocale('en', 'cs')).toBe(false)
  })

  // An intro narrated in Portuguese serves pt-BR.
  it('compares the base subtag, not the locale', () => {
    expect(transcriptSpeaksLocale('pt', 'pt-BR')).toBe(true)
  })

  // Detection found nothing to disagree with, so there is no mismatch to report.
  it('accepts an undetected language', () => {
    expect(transcriptSpeaksLocale(null, 'cs')).toBe(true)
    expect(transcriptSpeaksLocale(undefined, 'cs')).toBe(true)
    expect(transcriptSpeaksLocale('', 'cs')).toBe(true)
  })

  it('accepts a language this CMS does not offer', () => {
    expect(transcriptSpeaksLocale('klingon', 'cs')).toBe(true)
  })

  // `locale: 'all'` reaches here from a whole-document read.
  it('accepts a reader whose locale is not one locale', () => {
    expect(transcriptSpeaksLocale('cs', 'all')).toBe(true)
    expect(transcriptSpeaksLocale('cs', null)).toBe(true)
  })
})
