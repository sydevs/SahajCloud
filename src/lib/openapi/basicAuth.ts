/**
 * Validates an HTTP Basic Auth header against a known password.
 * Accepts any username — only the password is checked.
 */
export function checkBasicAuth(authHeader: string, password: string): boolean {
  if (!authHeader.startsWith('Basic ')) return false
  try {
    const decoded = atob(authHeader.slice(6).trim())
    const colonIdx = decoded.indexOf(':')
    const pwd = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : decoded
    return pwd === password
  } catch {
    return false
  }
}
