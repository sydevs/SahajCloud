# MeditationFrameEditor Architecture

The **Audio-Synchronized Frame Editor** is a sophisticated custom field component for the Meditations collection that provides audio-synchronized frame management with a rich admin interface.

## Component Structure

**Location**: `src/components/admin/MeditationFrameEditor/`

- `index.tsx` - Main component integrating with Payload's field system using `useField` hook
- `types.ts` - TypeScript interfaces for KeyframeData and component props
- `MeditationFrameEditorModal.tsx` - Modal wrapper with collapsed/expanded states
- `AudioPlayer.tsx` - HTML5 audio player with timeline and frame markers
- `FrameLibrary.tsx` - Grid display of available frames with filtering
- `FrameManager.tsx` - Current frame list with inline editing capabilities
- `FramePreview.tsx` - Live slideshow preview synchronized with audio

## Key Features

- **Modal-Based Interface**: Uses Payload's `FullscreenModal` for consistent styling
  - Collapsed state: Live preview + "Edit Video" button
  - Expanded state: Two-column layout (preview/audio/frames | frame library)
- **Audio Integration**: HTML5 audio player with click-to-seek timeline
- **Frame Synchronization**: Real-time frame switching based on audio timestamp
- **Gender-Based Filtering**: Automatically filters frames by narrator gender (imageSet)
- **Tag-Based Filtering**: Multi-select tag filtering for frame discovery
- **Timestamp Validation**: Prevents duplicate timestamps and enforces constraints
- **First-Frame Rule**: Automatically sets first frame to 0 seconds

## Data Integration

- **Field Integration**: Uses `useField<KeyframeData[]>` hook for Payload compatibility
- **Dynamic Loading**: Loads audio URL and narrator data from sibling fields
- **API Integration**: Fetches frames and narrator data via Payload's REST API
- **State Management**: Temporary state for modal with save/cancel functionality

## User Workflow

1. User uploads audio file to meditation
2. "Edit Video" button becomes enabled in collapsed state
3. Modal opens with frame library filtered by narrator gender
4. User clicks frames to add them at current audio timestamp
5. Frame Manager allows timestamp editing with validation
6. Live Preview shows synchronized slideshow
7. Save/Cancel maintains data integrity

## Technical Implementation

- **Custom Field Component**: Registered in Meditations collection as `json` field type
- **Type Safety**: Full TypeScript integration with payload-types.ts
- **Error Handling**: Graceful degradation for missing audio or frames
- **Performance**: Efficient frame loading and caching
- **Accessibility**: Keyboard navigation and screen reader support
