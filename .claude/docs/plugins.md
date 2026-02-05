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

## Built-in Slug Generation

Payload provides a built-in `slugField` factory for automatic slug generation:

- **Import**: `import { slugField } from 'payload'`
- **Usage**: `slugField({ useAsSlug: 'title' })` - returns single RowField (no spread)
- **Features**:
  - `unique: true` and `index: true` are hardcoded
  - `position: 'sidebar'` is the default
  - Custom descriptions via `overrides` callback

**Example with custom description**:
```typescript
slugField({
  useAsSlug: 'name',
  overrides: (field) => {
    if (field.fields[1].type === 'text') {
      field.fields[1].admin = {
        ...field.fields[1].admin,
        description: 'URL-friendly identifier (auto-generated from name)',
      }
    }
    return field
  },
})
```
