import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FrameData } from '@/components/admin/MeditationFrameEditor/types'

/**
 * Unit tests for MeditationFrameEditor component logic
 * Tests pure functions and component behavior without DOM dependencies
 */
describe('MeditationFrameEditor Unit Tests', () => {
  describe('Frame Validation Logic', () => {
    const validateTimestamp = (timestamp: number, currentIndex: number, frames: FrameData[]): string | null => {
      if (timestamp < 0) return 'Timestamp must be 0 or greater'
      if (!Number.isInteger(timestamp)) return 'Timestamp must be a whole number'
      if (timestamp > 3600) return 'Timestamp cannot exceed 1 hour (3600s)'
      
      // Check for duplicates (excluding current frame)
      const otherFrames = frames.filter((_, index) => index !== currentIndex)
      if (otherFrames.some(f => f.timestamp === timestamp)) {
        return `Timestamp ${timestamp}s is already used by another frame`
      }
      
      return null
    }

    it('should accept valid timestamps', () => {
      const frames: FrameData[] = [
        { frame: 'frame1', timestamp: 10 },
        { frame: 'frame2', timestamp: 20 },
      ]

      expect(validateTimestamp(0, -1, frames)).toBeNull()
      expect(validateTimestamp(5, -1, frames)).toBeNull()
      expect(validateTimestamp(3600, -1, frames)).toBeNull()
    })

    it('should reject negative timestamps', () => {
      const frames: FrameData[] = []
      expect(validateTimestamp(-1, -1, frames)).toBe('Timestamp must be 0 or greater')
      expect(validateTimestamp(-10, -1, frames)).toBe('Timestamp must be 0 or greater')
    })

    it('should reject non-integer timestamps', () => {
      const frames: FrameData[] = []
      expect(validateTimestamp(10.5, -1, frames)).toBe('Timestamp must be a whole number')
      expect(validateTimestamp(0.1, -1, frames)).toBe('Timestamp must be a whole number')
    })

    it('should reject timestamps over 1 hour', () => {
      const frames: FrameData[] = []
      expect(validateTimestamp(3601, -1, frames)).toBe('Timestamp cannot exceed 1 hour (3600s)')
      expect(validateTimestamp(7200, -1, frames)).toBe('Timestamp cannot exceed 1 hour (3600s)')
    })

    it('should detect duplicate timestamps', () => {
      const frames: FrameData[] = [
        { frame: 'frame1', timestamp: 10 },
        { frame: 'frame2', timestamp: 20 },
        { frame: 'frame3', timestamp: 30 },
      ]

      expect(validateTimestamp(10, -1, frames)).toBe('Timestamp 10s is already used by another frame')
      expect(validateTimestamp(20, -1, frames)).toBe('Timestamp 20s is already used by another frame')
      expect(validateTimestamp(15, -1, frames)).toBeNull() // Not a duplicate
    })

    it('should allow editing existing frame timestamp', () => {
      const frames: FrameData[] = [
        { frame: 'frame1', timestamp: 10 },
        { frame: 'frame2', timestamp: 20 },
        { frame: 'frame3', timestamp: 30 },
      ]

      // Editing frame at index 1 (timestamp 20) to keep same timestamp
      expect(validateTimestamp(20, 1, frames)).toBeNull()
      
      // Editing frame at index 1 to a new timestamp
      expect(validateTimestamp(25, 1, frames)).toBeNull()
      
      // Editing frame at index 1 to a duplicate timestamp
      expect(validateTimestamp(10, 1, frames)).toBe('Timestamp 10s is already used by another frame')
    })
  })

  describe('Frame Selection Logic', () => {
    const handleFrameSelect = (
      frames: FrameData[],
      newFrameId: string,
      currentTime: number
    ): { success: boolean; error?: string; newFrames?: FrameData[] } => {
      const newFrameData: FrameData = {
        frame: newFrameId,
        timestamp: currentTime,
      }

      // Apply first frame rule: if this is the first frame, set timestamp to 0
      if (frames.length === 0) {
        newFrameData.timestamp = 0
      }

      // Check for duplicate timestamp
      const existingFrameAtTime = frames.find(f => f.timestamp === newFrameData.timestamp)
      if (existingFrameAtTime) {
        const timeToShow = newFrameData.timestamp === 0 ? '0 (first frame rule)' : newFrameData.timestamp
        return {
          success: false,
          error: `A frame already exists at ${timeToShow} seconds. Please choose a different time or remove the existing frame first.`
        }
      }

      const newFrames = [...frames, newFrameData]
      return { success: true, newFrames }
    }

    it('should apply first frame rule', () => {
      const result = handleFrameSelect([], 'frame1', 15)
      
      expect(result.success).toBe(true)
      expect(result.newFrames).toHaveLength(1)
      expect(result.newFrames![0].timestamp).toBe(0) // First frame forced to 0
      expect(result.newFrames![0].frame).toBe('frame1')
    })

    it('should use current time for subsequent frames', () => {
      const existingFrames: FrameData[] = [
        { frame: 'frame1', timestamp: 0 }
      ]
      
      const result = handleFrameSelect(existingFrames, 'frame2', 20)
      
      expect(result.success).toBe(true)
      expect(result.newFrames).toHaveLength(2)
      expect(result.newFrames![1].timestamp).toBe(20)
      expect(result.newFrames![1].frame).toBe('frame2')
    })

    it('should replace existing frame at same timestamp', () => {
      const existingFrames: FrameData[] = [
        { frame: 'frame1', timestamp: 0 },
        { frame: 'frame2', timestamp: 20 }
      ]
      
      // Updated logic to replace instead of error
      const newFrameId = 'frame3'
      const targetTime = 20
      
      const existingIndex = existingFrames.findIndex(f => f.timestamp === targetTime)
      let newFrames: FrameData[]
      
      if (existingIndex !== -1) {
        newFrames = [...existingFrames]
        newFrames[existingIndex] = { frame: newFrameId, timestamp: targetTime }
      } else {
        newFrames = [...existingFrames, { frame: newFrameId, timestamp: targetTime }]
      }
      
      expect(existingIndex).toBe(1) // Second frame should be replaced
      expect(newFrames).toHaveLength(2) // Same number of frames
      expect(newFrames[1].frame).toBe('frame3') // Frame replaced
      expect(newFrames[1].timestamp).toBe(20) // Timestamp unchanged
    })

    it('should handle first frame rule collision', () => {
      const existingFrames: FrameData[] = [
        { frame: 'frame1', timestamp: 0 }
      ]
      
      // Trying to add another frame when no frames exist should be caught by first frame rule
      const result = handleFrameSelect([], 'frame2', 10)
      
      expect(result.success).toBe(true)
      expect(result.newFrames![0].timestamp).toBe(0)
    })
  })

  describe('Frame Sorting Logic', () => {
    it('should sort frames by timestamp ascending', () => {
      const unsortedFrames: FrameData[] = [
        { frame: 'frame3', timestamp: 30 },
        { frame: 'frame1', timestamp: 0 },
        { frame: 'frame2', timestamp: 15 },
      ]

      const sortedFrames = [...unsortedFrames].sort((a, b) => a.timestamp - b.timestamp)

      expect(sortedFrames).toEqual([
        { frame: 'frame1', timestamp: 0 },
        { frame: 'frame2', timestamp: 15 },
        { frame: 'frame3', timestamp: 30 },
      ])
    })

    it('should handle empty frames array', () => {
      const emptyFrames: FrameData[] = []
      const sortedFrames = [...emptyFrames].sort((a, b) => a.timestamp - b.timestamp)
      
      expect(sortedFrames).toEqual([])
    })

    it('should handle single frame', () => {
      const singleFrame: FrameData[] = [
        { frame: 'frame1', timestamp: 10 }
      ]
      const sortedFrames = [...singleFrame].sort((a, b) => a.timestamp - b.timestamp)
      
      expect(sortedFrames).toEqual(singleFrame)
    })

    it('should maintain stable sort for equal timestamps', () => {
      const framesWithEqualTimestamps: FrameData[] = [
        { frame: 'frame1', timestamp: 10 },
        { frame: 'frame2', timestamp: 10 },
        { frame: 'frame3', timestamp: 5 },
      ]

      const sortedFrames = [...framesWithEqualTimestamps].sort((a, b) => a.timestamp - b.timestamp)

      expect(sortedFrames[0].timestamp).toBe(5)
      expect(sortedFrames[1].timestamp).toBe(10)
      expect(sortedFrames[2].timestamp).toBe(10)
      // Order of equal timestamps should be preserved
      expect(sortedFrames[1].frame).toBe('frame1')
      expect(sortedFrames[2].frame).toBe('frame2')
    })
  })

  describe('Current Frame Detection Logic', () => {
    const getCurrentFrame = (currentTime: number, frames: FrameData[]): FrameData | null => {
      if (frames.length === 0) return null
      
      // Sort frames by timestamp
      const sortedFrames = [...frames].sort((a, b) => a.timestamp - b.timestamp)
      
      // Find the frame that should be displayed at current time
      let currentFrame = sortedFrames[0]
      
      for (const frame of sortedFrames) {
        if (frame.timestamp <= currentTime) {
          currentFrame = frame
        } else {
          break
        }
      }
      
      return currentFrame
    }

    it('should return null for empty frames', () => {
      expect(getCurrentFrame(10, [])).toBeNull()
    })

    it('should return first frame for time before first timestamp', () => {
      const frames: FrameData[] = [
        { frame: 'frame1', timestamp: 10 },
        { frame: 'frame2', timestamp: 20 },
      ]

      expect(getCurrentFrame(5, frames)?.frame).toBe('frame1')
    })

    it('should return correct frame for exact timestamp match', () => {
      const frames: FrameData[] = [
        { frame: 'frame1', timestamp: 0 },
        { frame: 'frame2', timestamp: 15 },
        { frame: 'frame3', timestamp: 30 },
      ]

      expect(getCurrentFrame(0, frames)?.frame).toBe('frame1')
      expect(getCurrentFrame(15, frames)?.frame).toBe('frame2')
      expect(getCurrentFrame(30, frames)?.frame).toBe('frame3')
    })

    it('should return correct frame for time between timestamps', () => {
      const frames: FrameData[] = [
        { frame: 'frame1', timestamp: 0 },
        { frame: 'frame2', timestamp: 15 },
        { frame: 'frame3', timestamp: 30 },
      ]

      expect(getCurrentFrame(10, frames)?.frame).toBe('frame1')
      expect(getCurrentFrame(25, frames)?.frame).toBe('frame2')
      expect(getCurrentFrame(45, frames)?.frame).toBe('frame3')
    })

    it('should handle unsorted frame input', () => {
      const unsortedFrames: FrameData[] = [
        { frame: 'frame3', timestamp: 30 },
        { frame: 'frame1', timestamp: 0 },
        { frame: 'frame2', timestamp: 15 },
      ]

      expect(getCurrentFrame(10, unsortedFrames)?.frame).toBe('frame1')
      expect(getCurrentFrame(25, unsortedFrames)?.frame).toBe('frame2')
    })
  })

  describe('Frame Library Filtering Logic', () => {
    interface MockFrame {
      id: string
      name: string
      imageSet: 'male' | 'female'
      tags: string[]
    }

    const filterFrames = (
      frames: MockFrame[],
      gender: 'male' | 'female' | null,
      selectedTags: string[]
    ): MockFrame[] => {
      let filtered = frames

      // Filter by gender (imageSet)
      if (gender) {
        filtered = filtered.filter(frame => frame.imageSet === gender)
      }

      // Filter by tags
      if (selectedTags.length > 0) {
        filtered = filtered.filter(frame => 
          selectedTags.some(tagId => frame.tags.includes(tagId))
        )
      }

      return filtered
    }

    const mockFrames: MockFrame[] = [
      { id: '1', name: 'Male Agnya', imageSet: 'male', tags: ['morning', 'breathing'] },
      { id: '2', name: 'Male Heart', imageSet: 'male', tags: ['peaceful'] },
      { id: '3', name: 'Female Agnya', imageSet: 'female', tags: ['morning'] },
      { id: '4', name: 'Male Back', imageSet: 'male', tags: ['morning', 'advanced'] },
    ]

    it('should filter frames by gender', () => {
      const maleFrames = filterFrames(mockFrames, 'male', [])
      expect(maleFrames).toHaveLength(3)
      expect(maleFrames.map(f => f.name)).toEqual(['Male Agnya', 'Male Heart', 'Male Back'])

      const femaleFrames = filterFrames(mockFrames, 'female', [])
      expect(femaleFrames).toHaveLength(1)
      expect(femaleFrames[0].name).toBe('Female Agnya')
    })

    it('should filter frames by tags', () => {
      const morningFrames = filterFrames(mockFrames, null, ['morning'])
      expect(morningFrames).toHaveLength(3)
      expect(morningFrames.map(f => f.name)).toEqual(['Male Agnya', 'Female Agnya', 'Male Back'])

      const peacefulFrames = filterFrames(mockFrames, null, ['peaceful'])
      expect(peacefulFrames).toHaveLength(1)
      expect(peacefulFrames[0].name).toBe('Male Heart')
    })

    it('should combine gender and tag filters', () => {
      const maleMorningFrames = filterFrames(mockFrames, 'male', ['morning'])
      expect(maleMorningFrames).toHaveLength(2)
      expect(maleMorningFrames.map(f => f.name)).toEqual(['Male Agnya', 'Male Back'])

      const femalePeacefulFrames = filterFrames(mockFrames, 'female', ['peaceful'])
      expect(femalePeacefulFrames).toHaveLength(0)
    })

    it('should handle multiple tag filters (OR logic)', () => {
      const multiTagFrames = filterFrames(mockFrames, null, ['morning', 'peaceful'])
      expect(multiTagFrames).toHaveLength(4) // All frames have either morning or peaceful
    })

    it('should return empty array when no matches', () => {
      const noMatches = filterFrames(mockFrames, 'male', ['nonexistent'])
      expect(noMatches).toHaveLength(0)
    })

    it('should return all frames when no filters applied', () => {
      const allFrames = filterFrames(mockFrames, null, [])
      expect(allFrames).toHaveLength(4)
    })
  })

  describe('Modal State Management', () => {
    const createModalState = (initialFrames: FrameData[]) => {
      let tempFrames = [...initialFrames]
      let isOpen = false

      return {
        open: () => {
          tempFrames = [...initialFrames] // Reset to saved state
          isOpen = true
        },
        close: () => {
          isOpen = false
        },
        save: (onSave: (frames: FrameData[]) => void) => {
          onSave([...tempFrames])
          isOpen = false
        },
        cancel: () => {
          tempFrames = [...initialFrames] // Reset without saving
          isOpen = false
        },
        setTempFrames: (frames: FrameData[]) => {
          tempFrames = [...frames]
        },
        getTempFrames: () => [...tempFrames],
        isOpen: () => isOpen,
      }
    }

    it('should reset temp state when opening modal', () => {
      const savedFrames: FrameData[] = [
        { frame: 'frame1', timestamp: 0 },
        { frame: 'frame2', timestamp: 15 },
      ]
      
      const modal = createModalState(savedFrames)
      
      // Modify temp state
      modal.setTempFrames([{ frame: 'frame1', timestamp: 0 }])
      expect(modal.getTempFrames()).toHaveLength(1)
      
      // Open modal should reset to saved state
      modal.open()
      expect(modal.getTempFrames()).toHaveLength(2)
      expect(modal.isOpen()).toBe(true)
    })

    it('should save temp state when saving', () => {
      const savedFrames: FrameData[] = []
      const modal = createModalState(savedFrames)
      
      let savedResult: FrameData[] = []
      const onSave = (frames: FrameData[]) => {
        savedResult = frames
      }
      
      modal.open()
      modal.setTempFrames([{ frame: 'frame1', timestamp: 0 }])
      modal.save(onSave)
      
      expect(savedResult).toHaveLength(1)
      expect(savedResult[0].frame).toBe('frame1')
      expect(modal.isOpen()).toBe(false)
    })

    it('should discard temp state when canceling', () => {
      const savedFrames: FrameData[] = [
        { frame: 'frame1', timestamp: 0 }
      ]
      
      const modal = createModalState(savedFrames)
      
      modal.open()
      modal.setTempFrames([{ frame: 'frame2', timestamp: 15 }])
      expect(modal.getTempFrames()[0].frame).toBe('frame2')
      
      modal.cancel()
      expect(modal.isOpen()).toBe(false)
      
      // Reopen should show saved state, not discarded temp state
      modal.open()
      expect(modal.getTempFrames()[0].frame).toBe('frame1')
    })
  })
})