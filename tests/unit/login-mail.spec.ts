/**
 * The sign-in mail the login plugin generates for every collection it serves
 * (#847).
 *
 * The property under test is that it brands itself from the document rather
 * than from a constant — a silent failure, since an unbranded send still
 * arrives.
 */
import { describe, expect, it } from 'vitest'

import { managersLogin } from '@/collections/Managers/login'
import { emailFrom, generateEmailSubject } from '@/plugins/login/mail'
import type { LoginMailArgs } from '@/plugins/login/types'

const args = (project: LoginMailArgs['project']): LoginMailArgs => ({
  doc: { email: 'a@example.test', id: 1, name: 'A' },
  project,
  signInUrl: 'https://example.test/admin/login?token=t',
  validFor: '15 minutes',
})

describe('the sign-in mail', () => {
  it('brands the subject and the sender from the project it is given', () => {
    expect(generateEmailSubject(args('sahaj-atlas'))).toContain('Sahaj Atlas')
    expect(emailFrom('sahaj-atlas')).toContain('Sahaj Atlas')
  })

  it('falls back to the default brand when no project is resolved', () => {
    // `currentProject` is null for the admin "All Content" view, so this is the
    // live path, not a defensive branch.
    expect(generateEmailSubject(args(undefined))).toContain('WeMeditate Web')
  })

  it('sends the envelope From at the manager address, not the public one', () => {
    expect(emailFrom(undefined)).toContain('contact@sydevelopers.com')
  })
})

describe('managersLogin', () => {
  it('resolves the project off the document, and selects the field it reads', () => {
    expect(managersLogin.project?.({ id: 1, currentProject: 'sahaj-atlas' })).toBe('sahaj-atlas')
    expect(managersLogin.select).toMatchObject({ currentProject: true })
  })
})
