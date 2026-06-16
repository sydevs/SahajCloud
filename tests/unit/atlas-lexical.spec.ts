import { describe, expect, it } from 'vitest'

import { plainTextToLexical } from '../../seeds/atlas/helpers/lexical'

describe('plainTextToLexical', () => {
  it('returns undefined for blank or whitespace-only input', () => {
    expect(plainTextToLexical(undefined)).toBeUndefined()
    expect(plainTextToLexical(null)).toBeUndefined()
    expect(plainTextToLexical('')).toBeUndefined()
    expect(plainTextToLexical('   \n  ')).toBeUndefined()
  })

  it('wraps a single line in a root with one paragraph + text node', () => {
    const value = plainTextToLexical('Learn how to meditate.')
    expect(value).toEqual({
      root: {
        type: 'root',
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        children: [
          {
            type: 'paragraph',
            version: 1,
            direction: 'ltr',
            format: '',
            indent: 0,
            textFormat: 0,
            children: [
              {
                type: 'text',
                version: 1,
                text: 'Learn how to meditate.',
                format: 0,
                style: '',
                mode: 'normal',
                detail: 0,
              },
            ],
          },
        ],
      },
    })
  })

  it('splits newline-separated blocks into separate paragraphs', () => {
    const value = plainTextToLexical('Learn how to meditate.\n\nAprende a meditar.')
    const paragraphs = value!.root.children
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs.map((p) => p.children[0].text)).toEqual([
      'Learn how to meditate.',
      'Aprende a meditar.',
    ])
  })

  it('preserves non-ASCII characters verbatim (no HTML interpretation)', () => {
    const value = plainTextToLexical('Méditation à Paris — café & thé')
    expect(value!.root.children[0].children[0].text).toBe('Méditation à Paris — café & thé')
  })

  it('drops empty lines between blocks', () => {
    const value = plainTextToLexical('First\n\n\n  \nSecond')
    expect(value!.root.children.map((p) => p.children[0].text)).toEqual(['First', 'Second'])
  })
})
