import { serverEnv } from '@/lib/env'

/**
 * Get the server URL with the actual port that the application is running on
 * @returns The server URL (from env or constructed from PORT)
 */
export function getServerUrl(): string {
  // Prefer explicit environment variable
  if (serverEnv.SAHAJCLOUD_URL) {
    return serverEnv.SAHAJCLOUD_URL
  }

  // Use PORT environment variable (validated with default of 3000)
  const port = serverEnv.PORT
  return `http://localhost:${port}`
}
