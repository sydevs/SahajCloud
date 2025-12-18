# Frame Editor Architecture

The **Frame Editor** provides audio-synchronized frame management for the Meditations collection through two components integrated with PayloadCMS's Live Preview feature.

## Component Structure

**Location**: `src/components/admin/FrameEditor/`

```
FrameEditor/
├── index.ts              # Barrel export for components and utilities
├── FrameListManager.tsx  # Custom field component for managing frames
├── FrameInserter.tsx     # UI component for browsing and inserting frames
├── utils.ts              # Shared utilities (formatTime, parseTime, validateTimestamp)
└── styles.ts             # Shared style objects using PayloadCMS CSS variables
```

**Types**: `src/types/frames.ts`

- `KeyframeDefinition` - Minimal frame reference (id + timestamp)
- `KeyframeData` - Enriched frame data with full Frame details

## Key Features

- **Live Preview Integration**: Uses PayloadCMS `useLivePreviewContext` to auto-open live preview panel
- **PostMessage Communication**: Receives `PLAYBACK_TIME_UPDATE` events from live preview iframe
- **Gender-Based Filtering**: Automatically filters frames by narrator gender (imageSet)
- **Category Filtering**: Toggle categories with Pill components to filter frame library
- **MM:SS Timestamp Editing**: Inline text inputs with format validation
- **Duplicate Handling**: Replaces existing frame at same timestamp instead of error
- **Auto-Sorting**: Frames automatically sorted by timestamp on save

## User Interface

### Video Tab Structure

The Meditations collection uses nested tabs for frame management:

```
Video (tab)
├── Manage (sub-tab)
│   └── FrameListManager - Edit timestamps, reorder, remove frames
└── Insert (sub-tab)
    └── FrameInserter - Browse and add frames at current playback time
```

### FrameListManager Features

- Displays current frames with thumbnails and category badges
- Highlights active frame based on live preview playback time
- Editable MM:SS timestamp inputs
- Remove button with visual feedback
- "No frames" empty state

### FrameInserter Features

- 2-column CSS grid of available frames
- Category filter pills (click to toggle)
- Loading and empty states
- Frames filtered by narrator gender automatically
- Click frame to insert at current playback time

## Data Flow

1. **Live Preview Opens**: Component calls `setIsLivePreviewing(true)` on mount
2. **Playback Updates**: Live preview sends `{ type: 'PLAYBACK_TIME_UPDATE', currentTime: number }`
3. **Active Frame Highlight**: FrameListManager highlights frame at current timestamp
4. **Frame Insertion**: FrameInserter inserts frame at current playback time, replaces if duplicate
5. **Timestamp Validation**: Collection-level validation ensures valid timestamps and no duplicates
6. **Auto-Sort**: `beforeChange` hook sorts frames by timestamp on save
7. **Data Enrichment**: `afterRead` hook enriches frame data with Frame collection details

## Validation Rules (Collection-Level)

- Timestamps must be >= 0
- Timestamps must be integers (rounded on save)
- No duplicate timestamps allowed
- At least one frame required when audio exists (on update)
- Frames required to set publishAt date

## Technical Implementation

- **PayloadCMS Hooks**: `useField`, `useForm`, `useLivePreviewContext`
- **PayloadCMS UI**: `Pill`, `FieldLabel`, `FieldDescription`, `FieldError`, `toast`
- **CSS Variables**: Uses PayloadCMS theme variables for consistent styling
- **Type Safety**: Full TypeScript integration with `KeyframeData` and `KeyframeDefinition` types

## Shared Utilities (`utils.ts`)

- `formatTime(seconds)` - Format seconds to MM:SS display format
- `parseTime(timeStr)` - Parse MM:SS format to seconds (returns null if invalid)
- `validateTimestamp(timestamp, existingTimestamps, currentIndex?)` - Validate timestamp constraints
- `getCategoryLabel(value)` - Get human-readable label for frame category

## Shared Styles (`styles.ts`)

- `baseStyles` - Common styles (container, emptyState, loadingState, thumbnail)
- `listManagerStyles` - FrameListManager-specific styles (frameList, frameItem, timestampInput)
- `inserterStyles` - FrameInserter-specific styles (framesGrid, frameCard, categoryFilters)

## Testing

Integration tests in `tests/int/`:
- `meditationFrames.int.spec.ts` - Frame validation, sorting, enrichment, publish rules
- `frameFiltering.int.spec.ts` - Frame filtering by gender, category, and pagination
