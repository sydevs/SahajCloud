/**
 * Get the server URL with the actual port that the application is running on
 * @returns The server URL (from env or constructed from PORT)
 */
export function getServerUrl(): string {
  // Prefer explicit environment variable
  if (process.env.SAHAJCLOUD_URL) {
    return process.env.SAHAJCLOUD_URL
  }

  // Use PORT environment variable or default to 3000
  const port = process.env.PORT || '3000'
  return `http://localhost:${port}`
}
