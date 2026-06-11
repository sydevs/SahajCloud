import type { ReactElement } from 'react'

import { render } from '@react-email/render'

/**
 * Render a React Email template to email-client-safe inline HTML.
 *
 * Thin wrapper over `@react-email/render` so callers depend on the email plugin
 * (`@/plugins/email`) rather than the library directly. `render()` is async;
 * Payload's `generateEmailHTML` accepts an async return, so this drops in with
 * no adapter changes.
 */
export function renderEmail(element: ReactElement): Promise<string> {
  return render(element)
}
