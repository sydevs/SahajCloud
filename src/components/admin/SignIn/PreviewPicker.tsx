import type { GrantSummary } from '@/plugins/login'
import type { PayloadRequest } from 'payload'

import { Button } from '@payloadcms/ui'

import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import { summarizeGrants } from '@/plugins/login'

import { signInAsAction } from './actions'
import styles from './SignIn.module.css'

/**
 * How many accounts the picker lists. A preview holds the provisioned admin and
 * whatever the fixture seeded; a preview somebody filled by hand can hold
 * thousands, and a page listing them all would read every one's grants.
 */
const PICKER_LIMIT = 25

/**
 * The accounts in this preview, each a button that signs you in as it.
 *
 * ⚠ **Rendered only where `previewSignInHere()` holds** — see the caller. It is
 * an anonymous list of every account in the environment, which is exactly what
 * `request-magic-link` refuses to be on production, and it is safe here only
 * because Cloudflare Access and the proxy gate decided who may ask before the
 * request arrived.
 *
 * ⚠ **A row submits the page's own Server Action.** Its `signedIn` branch sets
 * the session cookie and
 * `redirect()`s, so signing in as a manager and typing their address into the
 * form are one implementation — and nothing here builds a response carrying a
 * `user`, whose `roles` would arrive flat and default-locale because three
 * auth-*response* hooks resolve them.
 */
export async function PreviewPicker({ req, returnTo }: { req: PayloadRequest; returnTo?: string }) {
  const { payload } = req
  const { docs } = await payload.find({
    collection: 'managers',
    limit: PICKER_LIMIT,
    depth: 0,
    sort: 'email',
    // Nobody is signed in on this page, so access would filter every row out.
    overrideAccess: true,
    select: { currentProject: true, email: true, name: true, type: true },
  })

  const rows: { email: string; name?: null | string; summaries: GrantSummary[]; type: unknown }[] =
    []
  for (const doc of docs) {
    rows.push({
      email: doc.email,
      name: doc.name,
      // ⚠ Its own copy per row, and sequentially: `createLocalReq` assigns
      // `locale` onto the request it is handed, and this read asks for every
      // locale (#609, #982).
      summaries: await summarizeGrants({
        collection: 'managers',
        current: doc.currentProject ?? undefined,
        id: doc.id,
        payload,
        req: localeIsolatedReq(req),
        type: doc.type,
      }),
      type: doc.type,
    })
  }

  return (
    <div className={styles.picker}>
      <h2>Sign in to this preview</h2>
      <p>
        Every account in this preview, with the access it holds. One click signs you in as it. This
        list exists on previews only.
      </p>
      {rows.map((row) => (
        <form action={signInAsAction} key={row.email}>
          <input name="email" type="hidden" value={row.email} />
          {returnTo ? <input name="redirect" type="hidden" value={returnTo} /> : null}
          <div className={styles.pickerRow}>
            <div>
              <strong>{row.name || row.email}</strong>
              <span className={styles.pickerMeta}>
                {row.email} · {row.type === 'admin' ? 'Administrator' : 'Manager'}
              </span>
              <Grants summaries={row.summaries} />
            </div>
            <Button buttonStyle="secondary" size="small" type="submit">
              Sign in
            </Button>
          </div>
        </form>
      ))}
      {docs.length === PICKER_LIMIT ? (
        <p>Showing the first {PICKER_LIMIT} accounts. Type an address below for any other.</p>
      ) : null}
    </div>
  )
}

/** One account's roles per locale, and the documents naming it. */
function Grants({ summaries }: { summaries: GrantSummary[] }) {
  const lines: string[] = []

  for (const summary of summaries) {
    if (summary.fullAccess) lines.push('Full access to every collection')
    for (const grant of summary.grants) lines.push(`${grant.locale}: ${grant.roles.join(', ')}`)
    for (const responsibility of summary.responsibilities) {
      const label =
        responsibility.items.length === 1 ? responsibility.singular : responsibility.label
      lines.push(`${label}: ${responsibility.items.map((item) => item.title).join(', ')}`)
    }
  }

  if (lines.length === 0) return <span className={styles.pickerMeta}>No roles, no listings</span>

  return (
    <ul className={styles.pickerGrants}>
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  )
}

export default PreviewPicker
