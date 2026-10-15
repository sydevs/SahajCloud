import { APIError, type Config } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  isOversizedUploadError,
  uploadErrorPlugin,
} from '../../src/plugins/storage/uploadErrorPlugin'
import {
  FileValidationError,
  UPLOAD_SIZE_LIMIT_MESSAGE,
} from '../../src/plugins/storage/uploadValidation'

/**
 * The errors here are built with Payload's own `APIError`, so the fixtures
 * carry the real `status` and `message` shape rather than a guess at it. The
 * wording is Payload's, from
 * `payload/dist/uploads/fetchAPI-multipart/processMultipart.js` — confirmed
 * against a running server, which answered a 60 MB upload with exactly this
 * message and a 413.
 */
const requestSizeError = () => new APIError('Multipart request size limit has been reached', 413)

/** What `routeError` hands a root `afterError` hook, reduced to what this one reads. */
const runHook = (error: unknown) => {
  const [hook] = uploadErrorPlugin()({} as Config).hooks?.afterError ?? []
  return (hook as (args: { error: unknown }) => unknown)({ error })
}

describe('isOversizedUploadError', () => {
  it('recognises the refusal Payload names no size in', () => {
    expect(isOversizedUploadError(requestSizeError())).toBe(true)
  })

  it.each([
    // Too many files, fields or parts — a 413, but not about a byte ceiling.
    ['another multipart limit', new APIError('Multipart limit has been reached', 413)],
    ['the same wording at another status', new APIError(requestSizeError().message, 500)],
    ['a non-object', requestSizeError().message],
    ['nothing', null],
  ])('leaves %s alone', (_case, error) => {
    expect(isOversizedUploadError(error)).toBe(false)
  })
})

describe('uploadErrorPlugin', () => {
  it('answers an over-limit request with the sizes it had to fit', () => {
    expect(runHook(requestSizeError())).toEqual({
      response: { errors: [{ message: UPLOAD_SIZE_LIMIT_MESSAGE }] },
    })
  })

  it('returns nothing for an error it does not recognise, so the status stands', () => {
    expect(runHook(new Error('boom'))).toBeUndefined()
  })

  it('keeps the hooks already registered', () => {
    const existing = () => undefined
    const config = { hooks: { afterError: [existing] } } as unknown as Config

    expect(uploadErrorPlugin()(config).hooks?.afterError?.[0]).toBe(existing)
  })
})

/**
 * A category limit is well under `UPLOAD_FILE_SIZE_LIMIT`, so this is the gate
 * an oversized image or document reaches, and it is thrown from an adapter's
 * `handleUpload` into `routeError`. Without a status it defaults to 500, which
 * `isErrorPublic` refuses to disclose — the message is replaced by "Something
 * went wrong." and the size it names never reaches the caller (#939).
 */
describe('FileValidationError', () => {
  it.each([
    ['SIZE_EXCEEDED', 413],
    ['INVALID_MIME_TYPE', 415],
    ['INVALID_FILE', 400],
  ] as const)('answers %s with %i, so routeError discloses the message', (code, status) => {
    expect(new FileValidationError('why', code).status).toBe(status)
  })

  it('carries no 500, which is the status routeError would redact', () => {
    const codes = ['SIZE_EXCEEDED', 'INVALID_MIME_TYPE', 'INVALID_FILE'] as const

    for (const code of codes) {
      expect(new FileValidationError('why', code).status).not.toBe(500)
    }
  })
})
