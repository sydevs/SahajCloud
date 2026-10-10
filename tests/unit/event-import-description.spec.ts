import { describe, expect, it } from 'vitest'

import { plainTextToLexical } from '@/lib/richEditor/plainTextToLexical'

/** The import's `description` column becomes paragraphs through this helper. */
describe('plainTextToLexical — line endings an imported description carries', () => {
  const paragraphs = (text: string) =>
    plainTextToLexical(text)!.root.children.map((paragraph) => paragraph.children[0]!.text)

  it.each([
    ['CRLF', 'First\r\nSecond'],
    ['LF', 'First\nSecond'],
    ['a bare CR', 'First\rSecond'],
  ])('splits on %s', (_name, text) => {
    expect(paragraphs(text)).toEqual(['First', 'Second'])
  })

  it('drops the empty paragraphs between blank lines of any ending', () => {
    expect(paragraphs('First\r\r\n\nSecond')).toEqual(['First', 'Second'])
  })
})
