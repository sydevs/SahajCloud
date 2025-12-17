// Common field utilities
// Note: Lowercase naming (e.g., mediaField) is the preferred convention
// PascalCase exports are preserved for backwards compatibility

// Media field - standardized media upload with ThumbnailCell component
export { MediaField, MediaField as mediaField } from './MediaField'
export type { MediaFieldOptions } from './MediaField'

// URL field - text field with URL validation
export { UrlField, UrlField as urlField } from './UrlField'
export type { UrlFieldOptions } from './UrlField'

// Color field - text field with hex color validation and color picker
export { colorField } from './ColorField'
export type { ColorFieldOptions } from './ColorField'

// Permissions fields - role-based access control field factories
export {
  ManagerPermissionsField,
  ManagerPermissionsField as managerPermissionsFields,
  ClientPermissionsField,
  ClientPermissionsField as clientPermissionsFields,
} from './PermissionsField'
