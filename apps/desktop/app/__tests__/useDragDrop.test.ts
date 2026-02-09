import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDragDrop, type DragDropCallbacks } from '../composables/useDragDrop'
import { createMockDragEvent, createMockStepDefinition } from './testUtils'

describe('useDragDrop', () => {
  let callbacks: DragDropCallbacks

  beforeEach(() => {
    callbacks = {
      onReorder: vi.fn(),
      onDropFromCatalog: vi.fn(),
    }
  })

  describe('initial state', () => {
    it('initializes with null draggedIndex', () => {
      const { draggedIndex } = useDragDrop(callbacks)
      expect(draggedIndex.value).toBeNull()
    })

    it('initializes with null dropTargetIndex', () => {
      const { dropTargetIndex } = useDragDrop(callbacks)
      expect(dropTargetIndex.value).toBeNull()
    })

    it('initializes with scenario as default dragType', () => {
      const { dragType } = useDragDrop(callbacks)
      expect(dragType.value).toBe('scenario')
    })

    it('initializes with isDraggingFromCatalog as false', () => {
      const { isDraggingFromCatalog } = useDragDrop(callbacks)
      expect(isDraggingFromCatalog.value).toBe(false)
    })
  })

  describe('handleDragStart', () => {
    it('sets draggedIndex to the provided index', () => {
      const { draggedIndex, handleDragStart } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragstart')

      handleDragStart(2, 'scenario', event)

      expect(draggedIndex.value).toBe(2)
    })

    it('sets dragType to the provided type', () => {
      const { dragType, handleDragStart } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragstart')

      handleDragStart(0, 'background', event)

      expect(dragType.value).toBe('background')
    })

    it('sets dataTransfer effectAllowed to move', () => {
      const { handleDragStart } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragstart')

      handleDragStart(0, 'scenario', event)

      expect(event.dataTransfer?.effectAllowed).toBe('move')
    })

    it('sets dataTransfer data with index', () => {
      const { handleDragStart } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragstart')

      handleDragStart(5, 'scenario', event)

      expect(event.dataTransfer?.getData('text/plain')).toBe('5')
    })

    it('handles event without dataTransfer', () => {
      const { handleDragStart, draggedIndex } = useDragDrop(callbacks)
      const event = { type: 'dragstart' } as DragEvent

      // Should not throw
      handleDragStart(0, 'scenario', event)

      expect(draggedIndex.value).toBe(0)
    })
  })

  describe('handleDragEnter', () => {
    it('sets dropTargetIndex when valid drop target', () => {
      const { dropTargetIndex, handleDragStart, handleDragEnter } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragstart')

      handleDragStart(0, 'scenario', event)
      handleDragEnter(2, 'scenario')

      expect(dropTargetIndex.value).toBe(2)
    })

    it('does not set dropTargetIndex for same index (self-drop)', () => {
      const { dropTargetIndex, handleDragStart, handleDragEnter } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragstart')

      handleDragStart(1, 'scenario', event)
      handleDragEnter(1, 'scenario')

      expect(dropTargetIndex.value).toBeNull()
    })

    it('does not set dropTargetIndex for different type', () => {
      const { dropTargetIndex, handleDragStart, handleDragEnter } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragstart')

      handleDragStart(0, 'scenario', event)
      handleDragEnter(2, 'background')

      expect(dropTargetIndex.value).toBeNull()
    })

    it('does not set dropTargetIndex when nothing is being dragged', () => {
      const { dropTargetIndex, handleDragEnter } = useDragDrop(callbacks)

      handleDragEnter(2, 'scenario')

      expect(dropTargetIndex.value).toBeNull()
    })

    it('updates dropTargetIndex when entering different targets', () => {
      const { dropTargetIndex, handleDragStart, handleDragEnter } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragstart')

      handleDragStart(0, 'scenario', event)
      handleDragEnter(1, 'scenario')
      expect(dropTargetIndex.value).toBe(1)

      handleDragEnter(3, 'scenario')
      expect(dropTargetIndex.value).toBe(3)
    })
  })

  describe('handleDragOver', () => {
    it('prevents default', () => {
      const { handleDragOver } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragover')

      handleDragOver(event)

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('sets dropEffect to move', () => {
      const { handleDragOver } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragover')

      handleDragOver(event)

      expect(event.dataTransfer?.dropEffect).toBe('move')
    })
  })

  describe('handleDrop', () => {
    it('calls onReorder callback with correct arguments', () => {
      const { handleDragStart, handleDrop } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragstart')

      handleDragStart(1, 'scenario', event)
      handleDrop(3, 'scenario')

      expect(callbacks.onReorder).toHaveBeenCalledWith(1, 3, 'scenario')
    })

    it('calls onReorder with background type', () => {
      const { handleDragStart, handleDrop } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragstart')

      handleDragStart(0, 'background', event)
      handleDrop(2, 'background')

      expect(callbacks.onReorder).toHaveBeenCalledWith(0, 2, 'background')
    })

    it('does not call onReorder for self-drop', () => {
      const { handleDragStart, handleDrop } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragstart')

      handleDragStart(2, 'scenario', event)
      handleDrop(2, 'scenario')

      expect(callbacks.onReorder).not.toHaveBeenCalled()
    })

    it('does not call onReorder for different type', () => {
      const { handleDragStart, handleDrop } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragstart')

      handleDragStart(0, 'scenario', event)
      handleDrop(2, 'background')

      expect(callbacks.onReorder).not.toHaveBeenCalled()
    })

    it('does not call onReorder when nothing is being dragged', () => {
      const { handleDrop } = useDragDrop(callbacks)

      handleDrop(2, 'scenario')

      expect(callbacks.onReorder).not.toHaveBeenCalled()
    })

    it('resets state after drop', () => {
      const { draggedIndex, dropTargetIndex, handleDragStart, handleDragEnter, handleDrop } =
        useDragDrop(callbacks)
      const event = createMockDragEvent('dragstart')

      handleDragStart(0, 'scenario', event)
      handleDragEnter(2, 'scenario')
      handleDrop(2, 'scenario')

      expect(draggedIndex.value).toBeNull()
      expect(dropTargetIndex.value).toBeNull()
    })
  })

  describe('handleDragEnd', () => {
    it('resets all state', () => {
      const { draggedIndex, dropTargetIndex, isDraggingFromCatalog, handleDragStart, handleDragEnter, handleDragEnd } =
        useDragDrop(callbacks)
      const event = createMockDragEvent('dragstart')

      handleDragStart(1, 'scenario', event)
      handleDragEnter(3, 'scenario')

      handleDragEnd()

      expect(draggedIndex.value).toBeNull()
      expect(dropTargetIndex.value).toBeNull()
      expect(isDraggingFromCatalog.value).toBe(false)
    })
  })

  describe('handleCatalogDragOver', () => {
    it('prevents default', () => {
      const { handleCatalogDragOver } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragover')

      handleCatalogDragOver(event)

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('sets dropEffect to copy', () => {
      const { handleCatalogDragOver } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragover')

      handleCatalogDragOver(event)

      expect(event.dataTransfer?.dropEffect).toBe('copy')
    })

    it('sets isDraggingFromCatalog to true', () => {
      const { isDraggingFromCatalog, handleCatalogDragOver } = useDragDrop(callbacks)
      const event = createMockDragEvent('dragover')

      handleCatalogDragOver(event)

      expect(isDraggingFromCatalog.value).toBe(true)
    })
  })

  describe('handleCatalogDragLeave', () => {
    it('sets isDraggingFromCatalog to false', () => {
      const { isDraggingFromCatalog, handleCatalogDragOver, handleCatalogDragLeave } =
        useDragDrop(callbacks)
      const event = createMockDragEvent('dragover')

      handleCatalogDragOver(event)
      handleCatalogDragLeave()

      expect(isDraggingFromCatalog.value).toBe(false)
    })
  })

  describe('handleDropFromCatalog', () => {
    it('calls onDropFromCatalog with parsed step', () => {
      const { handleDropFromCatalog } = useDragDrop(callbacks)
      const step = createMockStepDefinition({ pattern: 'test pattern' })
      const event = createMockDragEvent('drop', {
        'application/json': JSON.stringify(step),
      })

      handleDropFromCatalog(event, 'scenario')

      expect(callbacks.onDropFromCatalog).toHaveBeenCalledWith(
        expect.objectContaining({ pattern: 'test pattern' }),
        'scenario'
      )
    })

    it('calls onDropFromCatalog with correct target', () => {
      const { handleDropFromCatalog } = useDragDrop(callbacks)
      const step = createMockStepDefinition()
      const event = createMockDragEvent('drop', {
        'application/json': JSON.stringify(step),
      })

      handleDropFromCatalog(event, 'background')

      expect(callbacks.onDropFromCatalog).toHaveBeenCalledWith(expect.any(Object), 'background')
    })

    it('prevents default', () => {
      const { handleDropFromCatalog } = useDragDrop(callbacks)
      const step = createMockStepDefinition()
      const event = createMockDragEvent('drop', {
        'application/json': JSON.stringify(step),
      })

      handleDropFromCatalog(event, 'scenario')

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('resets isDraggingFromCatalog', () => {
      const { isDraggingFromCatalog, handleCatalogDragOver, handleDropFromCatalog } =
        useDragDrop(callbacks)
      const step = createMockStepDefinition()
      const overEvent = createMockDragEvent('dragover')
      const dropEvent = createMockDragEvent('drop', {
        'application/json': JSON.stringify(step),
      })

      handleCatalogDragOver(overEvent)
      handleDropFromCatalog(dropEvent, 'scenario')

      expect(isDraggingFromCatalog.value).toBe(false)
    })

    it('does not call callback when no data', () => {
      const { handleDropFromCatalog } = useDragDrop(callbacks)
      const event = createMockDragEvent('drop')

      handleDropFromCatalog(event, 'scenario')

      expect(callbacks.onDropFromCatalog).not.toHaveBeenCalled()
    })

    it('does not call callback for invalid JSON', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { handleDropFromCatalog } = useDragDrop(callbacks)
      const event = createMockDragEvent('drop', {
        'application/json': 'invalid json',
      })

      handleDropFromCatalog(event, 'scenario')

      expect(callbacks.onDropFromCatalog).not.toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('resetState', () => {
    it('resets all state values', () => {
      const { draggedIndex, dropTargetIndex, isDraggingFromCatalog, handleDragStart, handleDragEnter, handleCatalogDragOver, resetState } =
        useDragDrop(callbacks)
      const event = createMockDragEvent('dragstart')
      const overEvent = createMockDragEvent('dragover')

      handleDragStart(1, 'scenario', event)
      handleDragEnter(2, 'scenario')
      handleCatalogDragOver(overEvent)

      resetState()

      expect(draggedIndex.value).toBeNull()
      expect(dropTargetIndex.value).toBeNull()
      expect(isDraggingFromCatalog.value).toBe(false)
    })
  })

  describe('utility functions', () => {
    describe('isDragging', () => {
      it('returns false initially', () => {
        const { isDragging } = useDragDrop(callbacks)
        expect(isDragging()).toBe(false)
      })

      it('returns true when dragging an item', () => {
        const { handleDragStart, isDragging } = useDragDrop(callbacks)
        const event = createMockDragEvent('dragstart')

        handleDragStart(0, 'scenario', event)

        expect(isDragging()).toBe(true)
      })

      it('returns true when dragging from catalog', () => {
        const { handleCatalogDragOver, isDragging } = useDragDrop(callbacks)
        const event = createMockDragEvent('dragover')

        handleCatalogDragOver(event)

        expect(isDragging()).toBe(true)
      })
    })

    describe('isDropTarget', () => {
      it('returns false when no drop target', () => {
        const { isDropTarget } = useDragDrop(callbacks)
        expect(isDropTarget(0, 'scenario')).toBe(false)
      })

      it('returns true for current drop target', () => {
        const { handleDragStart, handleDragEnter, isDropTarget } = useDragDrop(callbacks)
        const event = createMockDragEvent('dragstart')

        handleDragStart(0, 'scenario', event)
        handleDragEnter(2, 'scenario')

        expect(isDropTarget(2, 'scenario')).toBe(true)
      })

      it('returns false for different index', () => {
        const { handleDragStart, handleDragEnter, isDropTarget } = useDragDrop(callbacks)
        const event = createMockDragEvent('dragstart')

        handleDragStart(0, 'scenario', event)
        handleDragEnter(2, 'scenario')

        expect(isDropTarget(1, 'scenario')).toBe(false)
      })

      it('returns false for different type', () => {
        const { handleDragStart, handleDragEnter, isDropTarget } = useDragDrop(callbacks)
        const event = createMockDragEvent('dragstart')

        handleDragStart(0, 'scenario', event)
        handleDragEnter(2, 'scenario')

        expect(isDropTarget(2, 'background')).toBe(false)
      })
    })

    describe('isDraggedItem', () => {
      it('returns false when nothing is dragged', () => {
        const { isDraggedItem } = useDragDrop(callbacks)
        expect(isDraggedItem(0, 'scenario')).toBe(false)
      })

      it('returns true for dragged item', () => {
        const { handleDragStart, isDraggedItem } = useDragDrop(callbacks)
        const event = createMockDragEvent('dragstart')

        handleDragStart(3, 'background', event)

        expect(isDraggedItem(3, 'background')).toBe(true)
      })

      it('returns false for different index', () => {
        const { handleDragStart, isDraggedItem } = useDragDrop(callbacks)
        const event = createMockDragEvent('dragstart')

        handleDragStart(3, 'scenario', event)

        expect(isDraggedItem(0, 'scenario')).toBe(false)
      })

      it('returns false for different type', () => {
        const { handleDragStart, isDraggedItem } = useDragDrop(callbacks)
        const event = createMockDragEvent('dragstart')

        handleDragStart(3, 'scenario', event)

        expect(isDraggedItem(3, 'background')).toBe(false)
      })
    })
  })
})
