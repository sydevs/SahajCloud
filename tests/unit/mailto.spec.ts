/**
 * The one spelling of a pre-filled `mailto:` URL.
 *
 * Three callers compose their subject and body from free text — an event
 * title, a person's name, a quoted recap — so the cases are the characters
 * that would end a query parameter early and silently truncate the draft.
 */
import { describe, expect, it } from 'vitest'

import { mailtoHref } from '@/lib/utilities/mailto'

describe('mailtoHref', () => {
  it('puts the subject and body in their own parameters', () => {
    expect(mailtoHref('a@b.org', 'Hello', 'Body')).toBe('mailto:a@b.org?subject=Hello&body=Body')
  })

  it('encodes an `&`, which would otherwise start a third parameter', () => {
    const href = mailtoHref('a@b.org', 'Tea & cake', 'x')

    expect(href).toContain('subject=Tea%20%26%20cake')
    expect(href.split('&')).toHaveLength(2)
  })

  it('encodes the newlines a multi-line body is written with', () => {
    expect(mailtoHref('a@b.org', 's', 'one\n\ntwo')).toContain('body=one%0A%0Atwo')
  })
})
