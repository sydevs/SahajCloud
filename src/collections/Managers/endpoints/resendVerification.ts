import type { Endpoint } from 'payload'

import crypto from 'crypto'

import type { Manager } from '@/payload-types'
import { isAdminManager } from '@/plugins/access'
import type { EmailSendResult } from '@/plugins/email/resendAdapter'

/**
 * Payload mints a verification token as 20 random bytes, hex-encoded
 * (`payload/dist/collections/operations/create.js:184`). Matching that shape is
 * what lets the existing `/admin/managers/verify/:token` route keep working
 * unchanged — the route looks the token up by equality, so only its *value*
 * matters, but a shorter or differently-encoded token would be a second format
 * in the same column for no reason.
 */
function generateVerificationToken(): string {
  return crypto.randomBytes(20).toString('hex')
}

const denied = (message: string, status: number) =>
  Response.json({ errors: [{ message }] }, { status })

/**
 * POST /api/managers/:id/resend-verification
 *
 * Re-send a manager's verification email, minting a fresh token. Payload ships
 * no resend operation of any kind — its auth surface is
 * `forgotPassword / login / logout / me / refresh / resetPassword / unlock /
 * verifyEmail`, and `payload.verifyEmail()` *consumes* a token rather than
 * issuing one — so without this the only rescue for a manager whose first email
 * bounced was an admin setting `_verified` by hand in the database, which skips
 * verification rather than performing it (#680).
 *
 * Auth: `isAdminManager`, not `requireActiveClient` — that guard is for public
 * API `clients`, and this serves an authenticated admin acting on someone else's
 * document. For the same reason it is **absent from the OpenAPI client spec**:
 * `managers` is admin-only and in no project, so it exposes no public paths
 * (same rationale as `setProject`).
 *
 * **Admin-only, and that is the whole security model.** #680 weighed a public
 * "resend" against an admin-triggered one and chose the latter: no public
 * surface means no account-enumeration oracle, no email-bomb amplifier pointed
 * at an address the caller names, and so no Turnstile or rate limiting to get
 * right. If a public variant is ever wanted it needs all three, and it is a
 * different ticket.
 *
 * ⚠ **The email is rendered by the collection's own `auth.verify` functions**,
 * read off the sanitized config rather than re-implemented here. Payload's
 * internal `sendVerificationEmail` does this job but is not exported from the
 * package root, and reaching into `dist/` would couple us to its build layout.
 * Rendering from the config instead means this cannot drift from the email the
 * create path sends — and that drift is exactly what #320 was: a verification
 * link missing its collection slug, which fails *silently* because
 * `isPublicAdminRoute` waves any `/verify/` path past the auth gate.
 */
export const resendVerification: Endpoint = {
  path: '/:id/resend-verification',
  method: 'post',
  handler: async (req) => {
    if (!isAdminManager(req.user)) {
      return denied('You are not allowed to perform this action.', 403)
    }

    const rawId = req.routeParams?.id
    const id = Number(rawId)
    if (!Number.isInteger(id) || id <= 0) {
      return denied('Invalid manager id.', 400)
    }

    // `showHiddenFields` is what surfaces **`_verificationToken`**, which the
    // restore path below needs. It is the only hidden field of the pair —
    // `payload/dist/auth/baseFields/verification.js` puts `hidden: true` on the
    // token and leaves `_verified` an ordinary checkbox with `defaultAccess`
    // read, so `_verified` arrives with or without the flag. (The admin edit
    // view depends on that: it fetches without `showHiddenFields`, and
    // `ResendVerification.tsx` reads `_verified` off that document to decide
    // whether to render at all.)
    //
    // The `select` is the projection, done by the framework rather than by
    // hand: `hash`, `salt` and `resetPasswordToken` never enter this document,
    // so nothing downstream — including the template renderer below — can
    // read them by accident.
    const manager = (await req.payload.findByID({
      collection: 'managers',
      id,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
      select: { name: true, email: true, _verified: true, _verificationToken: true },
      disableErrors: true,
      req,
    })) as Manager | null

    if (!manager) return denied('Manager not found.', 404)

    // Not an error: an admin clicking this on a manager who verified in the
    // meantime should be told nothing happened, not shown a failure.
    if (manager._verified) {
      return Response.json(
        { ok: false, reason: 'already-verified', message: 'This manager is already verified.' },
        { status: 409 },
      )
    }

    if (!manager.email) return denied('This manager has no email address.', 422)

    // Payload already indexes the sanitized configs by slug, so this is the
    // typed lookup rather than a linear scan plus a cast.
    const verify = req.payload.collections.managers?.config.auth?.verify

    if (!verify || typeof verify === 'boolean' || typeof verify.generateEmailHTML !== 'function') {
      // Refuse rather than falling back to a hand-written email: a verification
      // link is the one thing here that must not be improvised.
      req.payload.logger.error({
        msg: 'resendVerification: Managers has no auth.verify.generateEmailHTML',
        managerId: id,
      })
      return denied('Verification email is not configured.', 500)
    }

    const token = generateVerificationToken()
    const previousToken = manager._verificationToken ?? null

    try {
      // Mirrors how `forgotPassword` persists its token
      // (`payload/dist/auth/operations/forgotPassword.js:79`) — the Local API
      // write, not a raw `db.updateOne`. Writing the new token is what revokes
      // the old one: the column holds exactly one value, so the previous link
      // stops verifying the moment this lands.
      await req.payload.update({
        collection: 'managers',
        id,
        data: { _verificationToken: token },
        overrideAccess: true,
        depth: 0,
        req,
      })

      // Built explicitly rather than spread, so what reaches the template
      // renderer is a decision rather than whatever the read happened to
      // return. The `select` above is what guarantees the credential columns
      // are absent either way.
      const user = {
        id: manager.id,
        name: manager.name,
        email: manager.email,
        collection: 'managers',
        _verificationToken: token,
      }
      const html = await verify.generateEmailHTML({ req, token, user })
      const subject =
        typeof verify.generateEmailSubject === 'function'
          ? await verify.generateEmailSubject({ req, token, user })
          : 'Verify Your Email'

      // ⚠ `payload.sendEmail` does NOT throw on a delivery failure. The Resend
      // adapter returns on every failure path on purpose — a throw would roll
      // back the manager-create transaction it also runs inside — so a `catch`
      // alone would report success for a message that was dropped, having
      // already revoked the manager's outstanding link. That is the #320/#675
      // failure class, on the path built to rescue it.
      //
      // Only an explicit `{ ok: false }` counts as a drop: Payload's own console
      // adapter stands in wherever email is unconfigured and resolves
      // `undefined`, which must keep reading as sent.
      //
      // `EmailSendResult` is exported by the adapter rather than restated
      // here, so the union is a compiler fact and a fourth drop path added
      // later cannot fail to reach this reader. The cast itself is
      // unavoidable: `EmailAdapter` is generic in its response, but that
      // generic does not reach `payload.sendEmail`, which is typed
      // `InitializedEmailAdapter['sendEmail']` and so returns `unknown`.
      const result = (await req.payload.sendEmail({
        to: manager.email,
        subject,
        html,
      })) as EmailSendResult

      if (result?.ok === false) {
        // Put the old token back, so a dropped resend leaves the manager exactly
        // as it found them — an outstanding link that still works beats a
        // revoked one and no replacement.
        //
        // ⚠ Its own try/catch, not the outer one. A restore that itself throws
        // would otherwise fall into the catch below and answer the generic 500
        // — reporting "nothing happened" for the single outcome where the
        // manager is genuinely worse off than before the call, with a link that
        // has been revoked and not replaced. That is the one state whose copy
        // has to say so.
        try {
          await req.payload.update({
            collection: 'managers',
            id,
            data: { _verificationToken: previousToken },
            overrideAccess: true,
            depth: 0,
            req,
          })
        } catch (restoreError) {
          req.payload.logger.error({
            msg: 'resendVerification: send was dropped AND the previous token could not be restored',
            managerId: id,
            error: restoreError instanceof Error ? restoreError.message : String(restoreError),
          })
          return denied(
            'The verification email could not be sent, and this manager’s earlier link has been revoked. Send another before they try the old one.',
            502,
          )
        }

        req.payload.logger.error({
          msg: 'resendVerification: send was dropped; restored the previous token',
          managerId: id,
        })
        return denied(
          'The verification email could not be sent. Any earlier link still works — try again shortly.',
          502,
        )
      }
    } catch (error) {
      req.payload.logger.error({
        msg: 'resendVerification: failed to re-send the verification email',
        managerId: id,
        error: error instanceof Error ? error.message : String(error),
      })
      return denied('Could not send the verification email. Please try again.', 500)
    }

    req.payload.logger.info({
      msg: 'resendVerification: verification email re-sent',
      managerId: id,
      by: req.user?.id,
    })

    return Response.json({ ok: true, email: manager.email })
  },
}
