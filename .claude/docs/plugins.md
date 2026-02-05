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

## Nested Docs Plugin (`@payloadcms/plugin-nested-docs`)

- **Applied to**: MeditationTags collection
- **Features**:
  - Manages `parent` relationship field for hierarchical nesting
  - Auto-generates `breadcrumbs` array field (hidden in admin UI)
  - Uses `createParentField()` and `createBreadcrumbsField()` factory functions with overrides
- **Configuration**: In `src/payload.config.ts`
- **Restrictions**: Single-level nesting enforced via `filterOptions` (client-side) and `beforeValidate` hook (server-side)
- **Companion Hooks**: `src/hooks/meditationTagHooks.ts` provides `validateNesting` (beforeValidate — uses `originalDoc.isParent` to avoid extra queries) and maintains a denormalized `isParent` checkbox via `afterChange`/`afterDelete` hooks, since the plugin doesn't provide a "has children" indicator and join fields are virtual (can't be used in `where` queries)

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
