---
description: Extract design from URL and create component (provide: component description, URL, and CSS selector)
argument-hint: [description]
allowed-tools: mcp__puppeteer__*, mcp__serena__*, Read, Write, Edit, Glob, Grep, Bash(lsof:*), Bash(find:*), Bash(ls:*)
---

## Environment Check

- Chrome debugging: !`lsof -ti:9222`
- Ladle status: !`lsof -ti:61000`
- Component count: !`find components -name "*.tsx" -not -name "*.stories.tsx" | wc -l`

## Your Task

$ARGUMENTS

## Design Extraction Workflow

Follow this procedure to extract and implement design components from live websites.

**MCP Tools**: This workflow uses Puppeteer MCP tools. See @MCP_USAGE.md for detailed usage patterns.

### 1. Examine Design

**Visit URL and Inspect**:
- Use Puppeteer to connect to Chrome debugging instance (if available)
- Navigate to the URL and examine HTML structure
- Use `puppeteer_evaluate` to extract computed styles (see @MCP_USAGE.md)
- **IMPORTANT**: Always use explicit `return` statements in `puppeteer_evaluate` (see @MCP_USAGE.md)
- Identify CSS classes, layout patterns, spacing, and typography
- Note: Don't take screenshots with Puppeteer unless explicitly needed - ask the user for screenshots if required

**Extract Design Tokens**:
- Record spacing values (margins, padding, gaps)
- Note font sizes, weights, and line heights
- Identify colors (text, backgrounds, borders)
- Measure dimensions (widths, heights, aspect ratios)
- Document layout patterns (flex, grid, positioning)

### 2. Identify Component Type

Determine the atomic design level:
- **Atom**: Single UI element (Button, Input, Avatar, Icon)
- **Molecule**: Group of atoms (FormField, Author byline, SearchBar)
- **Organism**: Complex sections (Header, Footer, ProductGrid)
- **Template**: Page layout structures

### 3. Implement Component

**Tailwind-Only Rule** (CRITICAL):
- Use ONLY Tailwind tokens - no custom CSS or absolute values
- For sizes: Use closest Tailwind token (e.g., 300px → `max-w-xs` (320px))
- For spacing: Use Tailwind scale (`p-4`, `gap-6`, `mt-8`)
- For colors: Use theme colors (`text-gray-700`, `bg-teal-500`)
- For typography: Use Tailwind text utilities (`text-base`, `font-light`)
- **If you need custom CSS/tokens, STOP and ask the user first**

**Component Best Practices**:
- Follow instructions in @DESIGN_SYSTEM.md strictly
- Use semantic HTML with proper ARIA attributes
- Components should NOT include float/positioning classes
- Keep components flexible - layout is handled by parent wrappers
- For molecules/organisms: Pay special attention to responsive design
- Implement mobile-first, then add responsive breakpoints

**Component Structure**:
```typescript
// ComponentName.tsx
export interface ComponentProps {
  // Required props first
  // Optional props with defaults
  // Alignment/layout props
}

export function Component({ ...props }: ComponentProps) {
  // Mobile-first implementation
  // Add md: breakpoints for desktop
}
```

### 4. Create Stories

Follow @STORYBOOK.md guidelines:

**For Atoms**:
- Use grids for multi-dimensional variations (variant × state, color × size)
- Standard sections: Variants → Sizes → Colors → States → Examples

**For Molecules**:
- One section per major variant
- Within each section: Minimal and Maximal subsections
- Minimal = only required props
- Maximal = all optional props populated
- Add "Maximal (Right Aligned)" if align prop exists
- NO grids for molecules - use vertical layouts with subsections

**For All Components**:
- Use placeholder images from Avatar stories: `https://picsum.photos/id/64/200/200`
- Wrap in StoryWrapper, use StorySection/StoryExampleSection
- End with `<div />` to remove trailing divider

### 5. Test and Verify

1. Create component file with TypeScript types
2. Create index.ts barrel export
3. Create .stories.tsx following @STORYBOOK.md
4. Update parent index.ts (atoms/molecules/organisms/index.ts)
5. Start/restart Ladle to view stories
6. Verify all variants render correctly
7. Test responsive behavior at different breakpoints
8. Check TypeScript compilation: `pnpm exec tsc --noEmit`
9. Confirm design matches original

### 6. Ask Clarification Questions

**When to Ask**:
- Design has ambiguous spacing or sizing
- Multiple valid approaches exist
- Unclear which Tailwind token is closest
- Custom CSS/tokens might be needed
- Responsive behavior is not obvious
- Component boundaries are unclear

**What to Ask**:
- "Should the max-width be X or Y?" (show Tailwind options)
- "How should this behave on mobile?"
- "Is this one component or should it be split?"
- "The spacing appears to be Xpx - use [tailwind-token] (Ypx)?"

## Common Patterns

**Layout/Positioning**:
- ❌ Don't add float classes to components
- ✅ Let parent wrappers handle positioning
- ✅ Use max-width constraints on components
- ✅ Use flexbox/grid for internal layout

**Responsive Design**:
- Start mobile-first (no breakpoint prefix)
- Add `md:` for tablet/desktop (768px+)
- Center-align on mobile, side-align on desktop is common
- Always keep description text left-aligned

**Alignment Props**:
- Add `align?: 'left' | 'right'` when component has text
- Use Tailwind responsive classes: `text-center md:text-left`
- Use flexbox order classes: `md:flex-row-reverse` for right-align

## Example Workflow

```
User: Create an Author molecule based on .author elements at https://wemeditate.com/articles/example

1. Connect to Chrome debugging (if running)
2. Navigate to URL with Puppeteer
3. Use puppeteer_evaluate to extract:
   - HTML structure (.author, .author__image, .author__name, etc.)
   - Computed styles (font-size, color, margins, layout)
4. Identify: Two variants (mini and hero)
5. Check design tokens:
   - Mini: 64px avatar (w-16), right-aligned, gray-700 text
   - Hero: 148px avatar (w-32 closest), left-aligned meta, center on mobile
   - Max width ~300px for mini → use max-w-xs (320px)
6. Ask clarifications:
   - "Should the Author include float positioning?" (No - handle in wrapper)
   - "Confirm spacing X should use Tailwind token Y?"
7. Implement:
   - Use Avatar atom for images
   - Use Text atom for typography
   - Add align prop with left/right options
   - Mobile-first: center everything except description
8. Create stories:
   - Section per variant (Mini Variant, Hero Variant)
   - Subsections: Minimal, Maximal, Maximal (Right Aligned)
   - Examples section with realistic usage
9. Update exports in components/molecules/index.ts
10. Test in Ladle
```
