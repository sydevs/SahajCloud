# Global Configuration Architecture

The application uses PayloadCMS Global Configs to manage centralized content configuration for the We Meditate website.

## We Meditate Web Settings Global

- **Location**: `src/globals/WeMeditateWebSettings.ts`
- **Slug**: `we-meditate-web-settings`
- **Admin Group**: Configuration
- **Access Control**: Admin-only using `adminOnlyAccess()`
- **Purpose**: Centrally manage static page assignments, featured navigation, and tag filters for the We Meditate website

## Tabs and Fields

### Static Pages Tab

- `homePage` (relationship to pages, required) - Home page content
- `musicPage` (relationship to pages, required) - Music page content
- `classesPage` (relationship to pages, required) - Classes page content
- `subtleSystemPage` (relationship to pages, required) - Subtle System page content
- `techniquesPage` (relationship to pages, required) - Techniques page content
- `inspirationPage` (relationship to pages, required) - Inspiration page content

### Navigation Tab

- `featuredPages` (relationship to pages, hasMany, minRows: 3, maxRows: 7, required) - Featured pages in website menu with drag-to-reorder capability

### Tag Filters Tab

- `inspirationPageTags` (relationship to page-tags, hasMany, minRows: 3, maxRows: 5, required) - Page tags displayed on Inspiration page
- `musicPageTags` (relationship to music-tags, hasMany, minRows: 3, maxRows: 5, required) - Music tags displayed on Music page

## Key Features

- **Admin-Only Access**: Only users with `admin: true` can view and modify the settings
- **Required Relationships**: All static page fields must be populated
- **Validation Constraints**: Featured pages (3-7 items) and tag filters (3-5 items each) enforce min/max row counts
- **Drag-to-Reorder**: Featured pages can be reordered in the admin interface
- **Centralized Management**: Single source of truth for website content configuration

## Implementation Details

- Defined in `src/globals/WeMeditateWebSettings.ts`
- Exported via `src/globals/index.ts` along with other global configs
- Registered in `src/payload.config.ts` via the `globals` array
- Uses tabs for organized field grouping (Static Pages, Navigation, Tag Filters)
