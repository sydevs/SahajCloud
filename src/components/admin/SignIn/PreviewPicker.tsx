import type { SignInNotice } from './SignInForm'
import type { PayloadRequest } from 'payload'

import { Banner, ChevronIcon } from '@payloadcms/ui'

import { MANAGER_INACTIVE } from '@/collections/Managers/login'
import { localeIsolatedReq } from '@/lib/utilities/localeIsolatedReq'
import type { GrantSummary } from '@/plugins/login'
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
 * The accounts in this preview, each a button that signs you in as it. On a preview this replaces the email form: nobody there reads mail.
 *
 * ⚠ **Rendered only where `previewSignInHere()` holds** — see the caller. It is
 * an anonymous list of every account in the environment, which is exactly what
 * `request-magic-link` refuses to be on production, and it is safe here only
 * because Cloudflare Access and the proxy gate decided who may ask before the
 * request arrived.
 *
 * ⚠ **A card submits the page's own Server Action.** Its `signedIn` branch sets
 * the session cookie and `redirect()`s, so the picker and the live form share
 * one implementation — and nothing here builds a response carrying a `user`,
 * whose `roles` would arrive flat and default-locale because three
 * auth-*response* hooks resolve them.
 */
export async function PreviewPicker({
  notice,
  req,
  returnTo,
}: {
  notice: SignInNotice | null
  req: PayloadRequest
  returnTo?: string
}) {
  const { payload } = req
  const { docs } = await payload.find({
    collection: 'managers',
    limit: PICKER_LIMIT,
    depth: 0,
    sort: 'email',
    // Nobody is signed in on this page, so access would filter every row out.
    overrideAccess: true,
    select: { currentProject: true, email: true, name: true, type: true },
    // ⚠ **Only accounts a click can actually sign in.** `issueMagicLink`
    // refuses an inactive manager (`isEligible`) and an unaccepted one (the
    // `_verified` guard), and the Server Action discards the outcome — so an
    // offered card that cannot sign in just re-renders the page, saying
    // nothing. Not offering it is the honest surface.
    where: { _verified: { equals: true }, type: { not_equals: MANAGER_INACTIVE } },
  })

  const rows: { email: string; name: string; reach: string }[] = []
  for (const doc of docs) {
    // ⚠ Its own copy per row, and sequentially: `createLocalReq` assigns
    // `locale` onto the request it is handed, and this read asks for every
    // locale (#609, #982).
    const summaries = await summarizeGrants({
      collection: 'managers',
      current: doc.currentProject ?? undefined,
      id: doc.id,
      payload,
      req: localeIsolatedReq(req),
      type: doc.type,
    })
    rows.push({
      email: doc.email,
      name: doc.name || doc.email,
      reach: reach(summaries),
    })
  }

  return (
    <div className={styles.stack}>
      <h2>Sign in to this preview</h2>
      <p>Choose an account to sign in as. This list exists on previews only.</p>
      {notice ? (
        <Banner type={notice.tone}>
          <strong>{notice.title}</strong> {notice.message}
        </Banner>
      ) : null}
      <div className={styles.list}>
        {rows.map((row) => (
          <form action={signInAsAction} key={row.email}>
            <input name="email" type="hidden" value={row.email} />
            {returnTo ? <input name="redirect" type="hidden" value={returnTo} /> : null}
            <AccountButton name={row.name} reach={row.reach} />
          </form>
        ))}
      </div>
      {docs.length === PICKER_LIMIT ? <p>Showing the first {PICKER_LIMIT} accounts.</p> : null}
    </div>
  )
}

/**
 * One picker row: the account's name over its reach, with a chevron. Payload has
 * no list-row button — `Card` sets its title as a small h5 and cannot hold a
 * subtitle — so this is the one hand-styled piece of the view.
 */
function AccountButton({ name, reach }: { name: string; reach: string }) {
  return (
    <button className={styles.account} type="submit">
      <span className={styles.accountText}>
        <strong>{name}</strong>
        <span className={styles.accountReach}>{reach}</span>
      </span>
      <ChevronIcon direction="right" />
    </button>
  )
}

/**
 * One account's reach in a few words: what it manages, else its roles. Which
 * account manages what is how a reviewer picks one, so this is the one detail
 * kept on the card.
 */
function reach(summaries: GrantSummary[]): string {
  if (summaries.some((summary) => summary.fullAccess)) return 'Administrator'

  const managed = summaries.flatMap((summary) =>
    summary.responsibilities.map(
      (responsibility) =>
        `${responsibility.items.length === 1 ? responsibility.singular : responsibility.label}: ` +
        responsibility.items.map((item) => item.title).join(', '),
    ),
  )
  if (managed.length > 0) return managed.join('; ')

  const roles = [
    ...new Set(summaries.flatMap((summary) => summary.grants.flatMap((grant) => grant.roles))),
  ]
  return roles.length > 0 ? roles.join(', ') : 'No roles'
}

export default PreviewPicker
