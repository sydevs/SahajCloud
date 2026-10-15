/**
 * Say which size an upload exceeded, instead of only that it did.
 *
 * Payload's per-file gate takes its wording from `upload.responseOnLimit`. The
 * request gate takes no option at all, so its 413 arrives naming no size and
 * the admin shows that verbatim — this rebuilds it. `routeError` applies what a
 * root `afterError` hook returns; `databaseErrorPlugin` spells that mechanism
 * out, and this follows it. (sydevs/SahajCloud#939)
 *
 * ⚠ **Payload's own REST routes only**, as in that plugin: an endpoint that
 * catches its own errors never reaches `routeError`, and so never reaches this.
 */
import type { Config } from 'payload'

import { isRecord } from '@/lib/utilities/isRecord'

import { UPLOAD_SIZE_LIMIT_MESSAGE } from './uploadValidation'

/**
 * Payload's wording for a body over `requestSizeLimit`, from
 * `payload/dist/uploads/fetchAPI-multipart/processMultipart.js`.
 */
const PAYLOAD_REQUEST_SIZE_MESSAGE = 'Multipart request size limit has been reached'

/** Whether an error is Payload's unnamed refusal of an over-limit request body. */
export function isOversizedUploadError(error: unknown): boolean {
  if (!isRecord(error)) return false
  // Every multipart limit throws 413, the count limits included, so the
  // message is what separates this one from them.
  return error.status === 413 && error.message === PAYLOAD_REQUEST_SIZE_MESSAGE
}

/**
 * Answer an over-limit upload with the sizes it had to fit.
 *
 * @example
 * ```typescript
 * import { uploadErrorPlugin } from '@/plugins/storage'
 *
 * plugins: [
 *   uploadErrorPlugin(),
 * ]
 * ```
 */
export const uploadErrorPlugin =
  () =>
  (config: Config): Config => ({
    ...config,
    hooks: {
      ...config.hooks,
      afterError: [
        ...(config.hooks?.afterError ?? []),
        ({ error }) => {
          if (!isOversizedUploadError(error)) return

          // No `status`: `routeError` keeps the error's own 413, which the
          // predicate already required.
          return { response: { errors: [{ message: UPLOAD_SIZE_LIMIT_MESSAGE }] } }
        },
      ],
    },
  })
