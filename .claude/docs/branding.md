# Project-Based Branding System

The application features a dynamic project-based branding system that adapts the admin panel appearance based on the currently selected project.

## Supported Projects

- **All Content** (`all-content`) - Default PayloadCMS theme with Sahaj Cloud lotus logo
- **WeMeditate Web** (`wemeditate-web`) - Coral/salmon theme with We Meditate web logo
- **WeMeditate App** (`wemeditate-app`) - Teal theme with We Meditate app logo
- **Sahaj Atlas** (`sahaj-atlas`) - Royal blue/indigo theme with Sahaj Atlas logo

## Admin Panel Branding Components

### Icon Component

[src/components/branding/Icon.tsx](../../src/components/branding/Icon.tsx):
- Dynamic project-specific icon rendering
- Uses Next.js Image component with project-based logo mapping
- Accepts `size` (default: 30px), `alt`, and `style` props
- Logo sources from `/public/images/`:
  - `sahaj-cloud.svg` (all-content)
  - `wemeditate-web.svg` (wemeditate-web)
  - `wemeditate-app.svg` (wemeditate-app)
  - `sahaj-atlas.webp` (sahaj-atlas)

### Logo Component

[src/components/branding/Logo.tsx](../../src/components/branding/Logo.tsx):
- Stacked vertical layout for login/signup pages
- Icon centered above project label
- Size: 64px with bold text using `--theme-elevation-800` color variable
- Registered in `payload.config.ts` as `graphics.Logo`

### InlineLogo Component

[src/components/branding/InlineLogo.tsx](../../src/components/branding/InlineLogo.tsx):
- Horizontal layout for admin navigation
- Icon beside project label with 25% border radius
- Size: 48px with bold text using `--theme-elevation-800` color variable
- Registered in `payload.config.ts` as `graphics.Icon`

### ProjectTheme Component

[src/components/admin/ProjectTheme.tsx](../../src/components/admin/ProjectTheme.tsx):
- Dynamically applies project-specific theme colors via CSS variables
- Injects `--theme-elevation-*` variables (0-1000) for light and dark modes
- Automatically updates on project switch or theme mode change
- Uses MutationObserver to detect dark/light mode toggles
- Theme definitions embedded in component with coral (wemeditate-web), teal (wemeditate-app), and royal blue (sahaj-atlas) palettes

## Configuration

- Branding components registered in [src/payload.config.ts](../../src/payload.config.ts) under `admin.components.graphics`
- Logo images stored in `/public/images/` for Cloudflare CDN optimization
- ProjectTheme mounted in AdminProvider for global theme application

## Frontend Splash Page

- **Location**: `src/app/(frontend)/page.tsx`
- **Features**:
  - We Meditate coral square logo with subtle floating animation
  - "We Meditate Admin" title
  - Coral color scheme (#F07855) with gradient animations
  - Simplified background with two animated gradient orbs
  - "Enter Admin Panel" button with coral gradient
  - Footer: "We Meditate • Powered by Payload CMS"
- **Metadata**: Updated in `src/app/(frontend)/layout.tsx` with "We Meditate Admin" title

## Color Palette

- **Primary Coral**: `#F07855`
- **Coral Light**: `#FF9477`
- **Coral Dark**: `#D86545`
- **Gradients**: Linear gradients using coral variations

## External Image Configuration

- **Next.js Config** (`next.config.mjs`) - Configured to allow images from `raw.githubusercontent.com` for We Meditate logo assets
- **Assets Source**: Logos sourced from We Meditate GitHub repository
