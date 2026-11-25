import { describe, expect, it } from 'vitest'

import { slugify } from '../../src/fields/slugify'

/**
 * ⚠ The same vectors are pinned in WeMeditateWeb (`lib/urls/slugify.test.ts`)
 * and WeMeditateApp, which run the same recipe.
 */
describe('slugify', () => {
  it.each([
    ['Universität Trier', 'universität-trier'],
    ['Straße', 'straße'],
    ['São Paulo', 'são-paulo'],
    ['Meditasyonun çıkış noktası', 'meditasyonun-çıkış-noktası'],
    ['Москва', 'москва'],
    ['Τα οφέλη του διαλογισμού', 'τα-οφέλη-του-διαλογισμού'],
    ['Մաս 1. Ուղիներ', 'մաս-1-ուղիներ'],
    ['Ի՞նչ ակնկալել', 'ինչ-ակնկալել'],
    ['مدیتیشن چیست؟', 'مدیتیشن-چیست'],
    ['ध्यान क्या है', 'ध्यान-क्या-है'],
    ["Shri Mataji's Lectures", 'shri-matajis-lectures'],
    ['Yoga & Ruhe | 50%', 'yoga-ruhe-50'],
    ['8.1 What we share — in detail', '8-1-what-we-share-in-detail'],
  ])('%j → %j', (value, slug) => {
    expect(slugify(value)).toBe(slug)
  })

  it('composes a letter written as base plus combining mark', () => {
    expect(slugify('Ku\u0308che')).toBe('küche')
  })

  it('returns an empty string when there is no letter or digit', () => {
    expect(slugify('')).toBe('')
    expect(slugify('?! 🧘')).toBe('')
    expect(slugify('\u2764\ufe0f 1\ufe0f\u20e3')).toBe('1')
    expect(slugify(null)).toBe('')
    expect(slugify(undefined)).toBe('')
  })
})
