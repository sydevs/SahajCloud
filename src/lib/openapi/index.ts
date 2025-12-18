/**
 * OpenAPI Utilities
 *
 * Provides utilities for generating and filtering OpenAPI specifications
 * with support for project-based filtering and custom Scalar documentation.
 */

// Spec filtering
export {
  filterSpec,
  ALWAYS_HIDDEN_COLLECTIONS,
  EXCLUDED_OPERATIONS,
  ALLOW_POST_FOR,
  DEFAULT_FILTER_CONFIG,
  type FilterOptions,
  type OpenAPISpec,
} from './specFilter'

// Custom Scalar plugin
export { scalarPlugin, type ScalarPluginOptions } from './scalarPlugin'
