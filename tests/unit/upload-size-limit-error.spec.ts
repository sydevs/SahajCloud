import { APIError, type Config } from 'payload'
import { describe, expect, it } from 'vitest'

import { uploadErrorPlugin } from '../../src/plugins/storage/uploadErrorPlugin'
import { UPLOAD_SIZE_LIMIT_MESSAGE, isOversizedUploadError } from '../../src/plugins/storage/uploadValidation'

/**
 * The errors here are built with Payload's own `APIError`, so the fixture
 * carries the real `status` and `message` shape rather than a guess at it. The
 * wording is Payload's, from
 * `payload/dist/uploads/fetchAPI-multipart/processMultipart.js` — confirmed
 * against a running server, which answered a 60 MB upload with exactly this
 * message and a 413.
 */
const requestSizeError = () => new APIError('Multipart request size limit has been reached', 413)

/** What `routeError` hands a root `afterError` hook, reduced to what this one reads. */
const runHook = (config: Config, error: unknown) => {
  const hooks = uploadErrorPlugin()(config).hooks?.afterError ?? []
  return hooks.map((hook) => (hook as (args: { error: unknown }) => unknown)({ error }))
}

describe('isOversizedUploadError', () => {
  it('recognises the refusal Payload names no size in', () => {
    expect(isOversizedUploadError(requestSizeError())).toBe(true)
  })

  it.each([
    // Too many files or fields — a 413, but not about size.
    ['another multipart limit', new APIError('Multipart limit has been reached', 413)],
    ['the same wording at another status', new APIError(requestSizeError().message, 500)],
    ['an unrelated error', new Error(requestSizeError().message)],
    ['a non-object', requestSizeError().message],
    ['nothing', null],
  ])('leaves %s alone', (_case, error) => {
    expect(isOversizedUploadError(error)).toBe(false)
  })
})

describe('uploadErrorPlugin', () => {
  it('answers an over-limit request with the sizes it had to fit', () => {
    expect(runHook({} as Config, requestSizeError())).toEqual([
      { response: { errors: [{ message: UPLOAD_SIZE_LIMIT_MESSAGE }] } },
    ])
  })

  it('returns nothing for an error it does not recognise, so the status stands', () => {
    expect(runHook({} as Config, new APIError('Multipart limit has been reached', 413))).toEqual([
      undefined,
    ])
  })

  it('keeps the hooks already registered', () => {
    const existing = () => undefined
    const config = { hooks: { afterError: [existing] } } as unknown as Config

    expect(uploadErrorPlugin()(config).hooks?.afterError?.[0]).toBe(existing)
  })
})
