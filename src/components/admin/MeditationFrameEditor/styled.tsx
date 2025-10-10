import styled, { css } from 'styled-components'
import { COLORS, GRID_CONFIG } from './constants'

// Inline Content Container
export const InlineContent = styled.div`
  display: flex;
  gap: 1rem;
  padding: 0;
  overflow: hidden;
  height: 700px;
  max-height: 700px;
`

// Layout Columns (Two-column layout)
export const LeftColumn = styled.div`
  flex: 0 0 300px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow: hidden;
  height: 100%;
`

export const RightColumn = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  overflow: hidden;
  height: 100%;
`

export const AudioPlayerSection = styled.div`
  flex-shrink: 0;
`

export const FrameManagerSection = styled.div`
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`

// Button Styles (kept for FrameManager delete functionality)
const buttonBase = css`
  border: none;
  border-radius: var(--style-radius-m);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background-color 0.2s;

  &:disabled {
    cursor: not-allowed;
  }
`

export const Button = styled.button<{
  variant?: 'primary' | 'secondary' | 'error'
}>`
  ${buttonBase}
  padding: 0.5rem 1rem;

  ${(props) => {
    switch (props.variant) {
      case 'primary':
        return css`
          background-color: ${COLORS.SUCCESS};
          color: white;
        `
      case 'secondary':
        return css`
          background-color: ${COLORS.ELEVATION_200};
          color: ${COLORS.TEXT};
        `
      case 'error':
        return css`
          background-color: ${COLORS.ERROR};
          color: white;
        `
      default:
        return css`
          background-color: ${COLORS.ELEVATION_200};
          color: ${COLORS.TEXT};
        `
    }
  }}
`

// Audio Player Components
export const AudioPlayerContainer = styled.div<{ $width: number }>`
  width: ${(props) => props.$width}px;
  position: relative;
`

export const AudioPreview = styled.div<{ $width: number; $height: number }>`
  width: ${(props) => props.$width}px;
  height: ${(props) => props.$height}px;
  background-color: #f0f0f0;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e0e0e0;
`

export const PreviewContainer = styled.div<{ $width: number; $height: number }>`
  width: ${(props) => props.$width}px;
  height: ${(props) => props.$height}px;
  background-color: #000;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e0e0e0;
`

export const TimelineTrack = styled.div`
  position: relative;
  height: 4px;
  background-color: #e0e0e0;
  border-radius: 2px;
  margin-top: 0.25rem;
`

export const TimelineMarker = styled.div<{ $left: number; $isActive?: boolean }>`
  position: absolute;
  left: ${(props) => props.$left}%;
  top: 50%;
  width: 8px;
  height: 8px;
  background-color: ${(props) => (props.$isActive ? '#4CAF50' : '#2196F3')};
  border-radius: 50%;
  transform: translate(-50%, -50%);
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 2;

  &:hover {
    transform: translate(-50%, -50%) scale(1.3);
  }
`

export const AudioPlayerOverlay = styled.div<{ $isHovered: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 10;

  /* Allow clicks on progress bar */
  & > * {
    pointer-events: auto;
  }
`

export const AudioPlayPauseButton = styled.button<{ $isHovered: boolean; $isPlaying: boolean }>`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: rgba(59, 130, 246, 0.7);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  transition: all 0.2s ease;
  opacity: ${(props) => (props.$isPlaying ? (props.$isHovered ? 1 : 0) : 1)};
  transform: ${(props) =>
    props.$isPlaying ? (props.$isHovered ? 'scale(1)' : 'scale(0.8)') : 'scale(1)'};
  pointer-events: auto;

  &:hover {
    background-color: rgba(59, 130, 246, 0.85);
    transform: scale(1.1);
  }

  &:disabled {
    background-color: rgba(156, 163, 175, 0.7);
    cursor: not-allowed;
  }
`

export const AudioProgressOverlay = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1rem;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, transparent 100%);
  pointer-events: auto;
`

export const AudioProgressBar = styled.div`
  position: relative;
  height: 6px;
  background-color: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
  cursor: pointer;
  overflow: visible;
`

export const AudioProgressFill = styled.div<{ $percentage: number }>`
  width: ${(props) => props.$percentage}%;
  height: 100%;
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 3px;
  transition: width 0.1s ease;
`

export const AudioFrameMarker = styled.div<{ $left: number }>`
  position: absolute;
  left: ${(props) => props.$left}%;
  top: -4px;
  width: 3px;
  height: 14px;
  background-color: #f97316;
  cursor: pointer;
  transform: translateX(-50%);
  opacity: 0.85;
  transition: all 0.2s ease;

  &:hover {
    opacity: 1;
    transform: translateX(-50%) scale(1.2);
  }
`

export const AudioInfoText = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: ${COLORS.ELEVATION_600};
  line-height: 1;
`

export const AudioInfoLeft = styled.div`
  flex: 1;
  font-weight: 500;
`

export const AudioInfoRight = styled.div`
  flex-shrink: 0;
  font-family: monospace;
  opacity: 0.8;
`
// Instructions Panel
export const InstructionsPanel = styled.div`
  font-size: 0.7rem;
  color: ${COLORS.ELEVATION_600};
  text-align: left;
  padding: 0.5rem 0.75rem;
  margin: 0.5rem 0;
  background-color: ${COLORS.ELEVATION_50};
  border-radius: var(--style-radius-m);
  border: 1px solid ${COLORS.BORDER};
  flex-shrink: 0;
  height: auto;
  line-height: 1.4;
`

// State Components
export const LoadingState = styled.div`
  padding: 2rem;
  text-align: center;
  background-color: ${COLORS.ELEVATION_50};
  border-radius: var(--style-radius-m);
  color: ${COLORS.TEXT};
`

export const ErrorState = styled.div`
  padding: 2rem;
  text-align: center;
  background-color: var(--theme-error-50);
  color: var(--theme-error-950);
  border-radius: var(--style-radius-m);
`

export const EmptyState = styled.div<{ $fontSize?: string }>`
  padding: 2rem;
  text-align: center;
  background-color: ${COLORS.ELEVATION_50};
  border: 1px dashed ${COLORS.BORDER};
  border-radius: var(--style-radius-m);
  color: ${COLORS.ELEVATION_600};
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${(props) => props.$fontSize || '1rem'};
`

// Component Headers
export const ComponentHeader = styled.h4`
  margin: 0 0 1rem 0;
  font-size: 1.1rem;
  font-weight: 600;
  flex-shrink: 0;
  color: ${COLORS.TEXT};
`

export const ComponentHeaderCount = styled.span`
  font-size: 0.875rem;
  font-weight: normal;
  color: ${COLORS.ELEVATION_600};
  margin-left: 0.5rem;
`

// Grid Components
export const FramesGrid = styled.div<{ $columns: string; $gap: string }>`
  display: grid;
  grid-template-columns: ${(props) => props.$columns};
  gap: ${(props) => props.$gap};
  flex: 1;
  overflow-y: auto;
  padding: 0;
  min-height: 0;
  justify-items: center;
`

export const FrameManagerList = styled.div`
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.25rem;
`

export const FrameManagerItem = styled.div<{
  $isLast?: boolean
  $isActive?: boolean
  $isClickable?: boolean
}>`
  display: flex;
  align-items: stretch;
  background-color: ${(props) =>
    props.$isActive ? 'rgba(59, 130, 246, 0.15)' : COLORS.ELEVATION_100};
  border-radius: 20px;
  overflow: hidden;
  height: 40px;
  transition: all 0.2s ease;
  border: 1px solid ${(props) => (props.$isActive ? 'rgba(59, 130, 246, 0.5)' : COLORS.BORDER)};
  cursor: ${(props) => (props.$isClickable ? 'pointer' : 'default')};

  &:hover {
    background-color: ${(props) =>
      props.$isActive ? 'rgba(59, 130, 246, 0.2)' : COLORS.ELEVATION_200};
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
`

export const FrameManagerPillIcon = styled.div`
  padding: 1px 4px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${COLORS.ELEVATION_600};
`

export const FrameManagerPillTitle = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 0.75rem;
  font-size: 0.8rem;
  color: ${COLORS.TEXT};
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const FrameManagerPillTimestamp = styled.input`
  width: 48px;
  height: 100%;
  padding: 0 0.5rem;
  border: none;
  background-color: transparent;
  font-size: 0.75rem;
  font-family: monospace;
  text-align: center;
  color: ${COLORS.TEXT};
  font-weight: 500;
  transition: background-color 0.2s ease;

  &:focus {
    outline: none;
    background-color: ${COLORS.ELEVATION_200};
  }

  &:hover:not(:disabled) {
    background-color: ${COLORS.ELEVATION_50};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Remove number input arrows */
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  -moz-appearance: textfield;
`

export const FrameManagerPillRemove = styled.button`
  width: 40px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background-color: transparent;
  color: ${COLORS.ELEVATION_600};
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background-color: ${COLORS.ERROR};
    color: white;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`

// Category Filters
export const CategoryFilters = styled.div`
  margin-bottom: ${GRID_CONFIG.GAP};
  flex-shrink: 0;
`

export const CategoryFilterRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${GRID_CONFIG.GAP_SMALL};
  align-items: center;
`

export const CategoryButton = styled.button<{ $selected?: boolean; $disabled?: boolean }>`
  padding: 0.125rem 0.5rem;
  font-size: 0.8rem;
  border: 1px solid ${COLORS.BORDER};
  border-radius: 12px;
  margin: 0.1rem;
  cursor: ${(props) => (props.$disabled ? 'not-allowed' : 'pointer')};
  opacity: ${(props) => (props.$disabled ? 0.6 : 1)};

  ${(props) =>
    props.$selected
      ? css`
          background-color: ${COLORS.SUCCESS};
          color: white;
        `
      : css`
          background-color: ${COLORS.BG};
          color: ${COLORS.TEXT};
        `}
`

export const ClearFiltersButton = styled.button<{ $disabled?: boolean }>`
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  background-color: transparent;
  color: ${COLORS.ERROR};
  border: none;
  cursor: ${(props) => (props.$disabled ? 'not-allowed' : 'pointer')};
  text-decoration: underline;
  margin-left: 4px;
`

// Frame Item Components
export const FrameItemContainer = styled.div<{
  $size: number
  $disabled: boolean
  $clickable: boolean
  $selected: boolean
  $clicked: boolean
}>`
  position: relative;
  cursor: ${(props) =>
    props.$disabled ? 'not-allowed' : props.$clickable ? 'pointer' : 'default'};
  opacity: ${(props) => (props.$disabled ? 0.6 : 1)};
  width: ${(props) => props.$size}px;
  border: ${(props) =>
    props.$selected || props.$clicked ? `2px solid ${COLORS.SUCCESS}` : '1px solid #ddd'};
  border-radius: 4px;
  background-color: ${(props) => (props.$selected || props.$clicked ? '#f8fff9' : '#fff')};
  transition: all 0.2s ease-in-out;
  transform: ${(props) => (props.$clicked ? 'scale(1.08)' : 'scale(1)')};
  box-shadow: ${(props) =>
    props.$selected || props.$clicked ? '0 6px 12px rgba(40, 167, 69, 0.3)' : 'none'};
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
`

export const FrameTags = styled.div`
  font-size: 0.75rem;
  color: #6b7280;
  text-align: center;
`

export const ComponentContainer = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
`
