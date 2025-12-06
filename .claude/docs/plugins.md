# Payload Plugins

The system integrates several official Payload plugins:

## SEO Plugin (`@payloadcms/plugin-seo`)

- **Applied to**: Pages collection
- **Features**:
  - Generates SEO metadata for pages
  - Custom title template: "We Meditate — {title}"
  - Uses page content for description
  - Tabbed UI for better organization
- **Configuration**: In `src/payload.config.ts`

## Form Builder Plugin (`@payloadcms/plugin-form-builder`)

- **Collections Created**:
  - `forms` - Form definitions with permission-based access
  - `form-submissions` - Submitted form data
- **Default Email**: contact@sydevelopers.com
- **Admin Groups**: Forms in "Resources", submissions in "System"
- **Access Control**: Uses standard permission-based access

## Better Fields Plugin (`@nouance/payload-better-fields-plugin`)

- **Features Used**: SlugField for automatic slug generation
- **Implementation**: Pages collection uses `SlugField('title')` for auto-generating slugs from titles
- **Benefits**: Consistent URL-friendly identifiers across content
