/**
 * Say which size an upload exceeded, instead of only that it did.
 *
 * Payload refuses an over-limit multipart body with a 413 whose message names
 * no number, and the admin shows that message verbatim. The per-file gate
 * beside it takes its wording from `upload.responseOnLimit`; the request gate
 * takes nothing, so its answer is rebuilt here. `routeError` applies what a
 * root `afterError` hook returns — the mechanism is spelled out in
 * `databaseErrorPlugin`, which this follows. (sydevs/SahajCloud#939)
 *
 * ⚠ **Payload's own REST routes only**, for the same reason as that plugin:
 * `routeError` is what invokes root `afterError` hooks, so an endpoint that
 * catches its own errors never reaches this.
 */
import type { Config } from 'payload'

import { UPLOAD_SIZE_LIMIT_MESSAGE, isOversizedUploadError } from './uploadValidation'

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
