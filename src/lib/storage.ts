/**
 * Storage configuration utilities for Payload collections
 */

/**
 * Detect production environment for storage configuration
 * Returns true if running in production and should use cloud storage
 * Returns false if running in development and should use local storage
 */
export const isProductionEnvironment = (): boolean => {
  // Check multiple indicators of production environment
  return (
    process.env.NODE_ENV === 'production' ||
    // Payload Cloud deployment
    process.env.PAYLOAD_CLOUD === 'true' ||
    // Railway/other cloud platforms
    process.env.RAILWAY_ENVIRONMENT === 'production'
  )
}

/**
 * Get storage configuration for upload collections
 * Automatically disables local storage in production environments
 */
export const getStorageConfig = () => ({
  // Automatically disable local storage in production environments
  // This allows cloud storage adapters (S3, MinIO, etc.) to take over
  // In development: uses local file system for easier testing
  // In production: relies on configured cloud storage adapters
  disableLocalStorage: isProductionEnvironment(),
})