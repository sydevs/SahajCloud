/**
 * OpenAPI Utilities
 *
 * Provides utilities for generating and filtering OpenAPI specifications
 * with support for client role-based filtering and custom Scalar documentation.
 */

// Spec filtering and marking
export {
  markInternalPaths,
  ALWAYS_HIDDEN_COLLECTIONS,
  EXCLUDED_OPERATIONS,
  ALLOW_POST_FOR,
  DEFAULT_MARKER_CONFIG,
  type MarkerOptions,
  type OpenAPISpec,
} from './markInternalPaths'

// Client role filtering utilities
export {
  getCollectionsForRole,
  getAllClientCollections,
  isValidClientRole,
  getClientRoleOptions,
} from './filterByClientRole'

// Custom Scalar plugin
export { scalarPlugin, type ScalarPluginOptions } from './scalarPlugin'
