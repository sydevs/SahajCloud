/**
 * Common error handling utilities for storage adapters
 *
 * Provides centralized error handling patterns to ensure consistent
 * error reporting across all storage adapters.
 */

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return String(error)
}

/**
 * Handle upload error with logging
 */
export function handleUploadError(
  error: unknown,
  context: {
    adapter: string
    filename: string
    mimeType: string
    size: number
  },
): never {
  // eslint-disable-next-line no-console
  console.error(`[${context.adapter}] Upload error:`, {
    filename: context.filename,
    mimeType: context.mimeType,
    size: context.size,
    error: getErrorMessage(error),
  })
  throw error
}

/**
 * Handle delete error with logging (non-throwing)
 */
export function handleDeleteError(
  error: unknown,
  context: {
    adapter: string
    identifier: string // Image ID, video ID, or file path
  },
): void {
  // eslint-disable-next-line no-console
  console.error(`[${context.adapter}] Delete error:`, {
    identifier: context.identifier,
    error: getErrorMessage(error),
  })
  // Don't throw - deletion errors shouldn't break the app
}

/**
 * Handle API response error from Cloudflare
 */
export function handleCloudflareAPIError(
  result: { success: boolean; errors?: Array<{ message: string }> },
  operation: string,
): void {
  if (!result.success) {
    const errors = result.errors?.map((e) => e.message).join(', ') || 'Unknown error'
    throw new Error(`Cloudflare ${operation} failed: ${errors}`)
  }
}
