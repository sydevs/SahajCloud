import { describe, expect, it } from 'vitest'

import { slugifyValue } from '../../src/fields/slugify'

/**
 * ⚠ The same vectors are pinned in WeMeditateWeb (`lib/urls/slugify.test.ts`)
 * and WeMeditateApp, which run the same recipe.
 */
describe('slugifyValue', () => {
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
    expect(slugifyValue(value)).toBe(slug)
  })

  it('composes a letter written as base plus combining mark', () => {
    expect(slugifyValue('Küche')).toBe('küche')
  })

  it('returns an empty string when there is no letter or digit', () => {
    expect(slugifyValue('')).toBe('')
    expect(slugifyValue('?! 🧘')).toBe('')
    expect(slugifyValue(null)).toBe('')
    expect(slugifyValue(undefined)).toBe('')
  })
})
