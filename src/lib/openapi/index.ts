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
  type FilterOptions,
  type OpenAPISpec,
} from './specFilter'

// Custom endpoint shim (payload-oapi doesn't generate these yet)
export { CUSTOM_ENDPOINT_PATHS, CUSTOM_ENDPOINT_SCHEMAS } from './customEndpoints'

// Custom Scalar plugin
export { scalarPlugin, type ScalarPluginOptions } from './scalarPlugin'

// Protect generated OpenAPI endpoints without Next middleware/proxy
export { openapiEndpointAuth, type OpenapiEndpointAuthOptions } from './endpointAuthPlugin'
