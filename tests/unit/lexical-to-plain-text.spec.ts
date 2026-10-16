import { describe, expect, it } from 'vitest'

import { lexicalToPlainText } from '@/lib/richEditor/lexicalToPlainText'
import { plainTextToLexical } from '@/lib/richEditor/plainTextToLexical'

const lexicalRoot = (children: unknown[]) => ({ root: { type: 'root', children } })

const paragraph = (...children: unknown[]) => ({ type: 'paragraph', children })

const textNode = (text: string) => ({ type: 'text', text })

describe('lexicalToPlainText', () => {
  it('round-trips its inverse', () => {
    // `plainTextToLexical` splits on a newline and this joins on a blank line,
    // so the two agree on block structure but not on its spelling.
    const value = plainTextToLexical('First block.\nSecond block.')
    expect(lexicalToPlainText(value)).toBe('First block.\n\nSecond block.')
  })

  it('separates blocks with a blank line and a soft break with one newline', () => {
    expect(
      lexicalToPlainText(
        lexicalRoot([paragraph(textNode('Mondays'), { type: 'linebreak' }, textNode('7pm'))]),
      ),
    ).toBe('Mondays\n7pm')
  })

  it('joins a formatting run into the sentence it sits in', () => {
    expect(
      lexicalToPlainText(
        lexicalRoot([
          paragraph(textNode('visit '), { ...textNode('our'), format: 1 }, textNode(' centre')),
        ]),
      ),
    ).toBe('visit our centre')
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'plain'],
    ['a number', 42],
    ['an empty object', {}],
    ['a null root', { root: null }],
    ['an empty root', lexicalRoot([])],
  ])('reads %s as empty', (_label, value) => {
    expect(lexicalToPlainText(value)).toBe('')
  })

  it.each([
    ['children that is not an array', { root: { type: 'root', children: 'nope' } }],
    ['a null child', lexicalRoot([null])],
  ])('reads %s as empty rather than throwing', (_label, value) => {
    // The two shapes Payload's converter throws a TypeError on. Every caller
    // reads a value another party stored, so each wants a projection.
    expect(lexicalToPlainText(value)).toBe('')
  })
})
