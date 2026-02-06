/**
 * Drag and drop composable for step reordering
 *
 * Manages drag-drop state and provides handlers for:
 * - Reordering steps within a list
 * - Dropping steps from a catalog
 */

import { ref } from 'vue'
import type { StepDefinition } from '@suisui/shared'

export type DragDropTarget = 'scenario' | 'background'

export interface DragDropCallbacks {
  onReorder: (fromIndex: number, toIndex: number, target: DragDropTarget) => void
  onDropFromCatalog: (step: StepDefinition, target: DragDropTarget) => void
}

export interface UseDragDropReturn {
  // State
  draggedIndex: ReturnType<typeof ref<number | null>>
  dropTargetIndex: ReturnType<typeof ref<number | null>>
  dragType: ReturnType<typeof ref<DragDropTarget>>
  isDraggingFromCatalog: ReturnType<typeof ref<boolean>>

  // Handlers for step items
  handleDragStart: (index: number, type: DragDropTarget, event: DragEvent) => void
  handleDragEnter: (index: number, type: DragDropTarget) => void
  handleDragOver: (event: DragEvent) => void
  handleDrop: (index: number, type: DragDropTarget) => void
  handleDragEnd: () => void

  // Handlers for drop zones (catalog drops)
  handleCatalogDragOver: (event: DragEvent) => void
  handleCatalogDragLeave: () => void
  handleDropFromCatalog: (event: DragEvent, target: DragDropTarget) => void

  // Utility
  resetState: () => void
  isDragging: () => boolean
  isDropTarget: (index: number, type: DragDropTarget) => boolean
  isDraggedItem: (index: number, type: DragDropTarget) => boolean
}

/**
 * Creates drag and drop handlers for step management
 *
 * @param callbacks - Callbacks for reorder and catalog drop events
 * @returns Object with reactive state and event handlers
 *
 * @example
 * ```ts
 * const { draggedIndex, handleDragStart, handleDrop } = useDragDrop({
 *   onReorder: (from, to, type) => store.moveStep(from, to),
 *   onDropFromCatalog: (step, type) => store.addStep(step),
 * })
 * ```
 */
export function useDragDrop(callbacks: DragDropCallbacks): UseDragDropReturn {
  // Reactive state
  const draggedIndex = ref<number | null>(null)
  const dropTargetIndex = ref<number | null>(null)
  const dragType = ref<DragDropTarget>('scenario')
  const isDraggingFromCatalog = ref(false)

  /**
   * Resets all drag-drop state
   */
  function resetState() {
    draggedIndex.value = null
    dropTargetIndex.value = null
    isDraggingFromCatalog.value = false
  }

  /**
   * Checks if any drag operation is in progress
   */
  function isDragging(): boolean {
    return draggedIndex.value !== null || isDraggingFromCatalog.value
  }

  /**
   * Checks if the given index is the current drop target
   */
  function isDropTarget(index: number, type: DragDropTarget): boolean {
    return dropTargetIndex.value === index && dragType.value === type
  }

  /**
   * Checks if the given index is being dragged
   */
  function isDraggedItem(index: number, type: DragDropTarget): boolean {
    return draggedIndex.value === index && dragType.value === type
  }

  // =========================================================================
  // Handlers for step item drag operations
  // =========================================================================

  /**
   * Handles drag start on a step item
   */
  function handleDragStart(index: number, type: DragDropTarget, event: DragEvent) {
    draggedIndex.value = index
    dragType.value = type

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(index))
    }
  }

  /**
   * Handles drag enter on a potential drop target
   */
  function handleDragEnter(index: number, type: DragDropTarget) {
    // Only show drop target if:
    // 1. We have a dragged item
    // 2. It's not the same item (no self-drop)
    // 3. It's the same type (scenario vs background)
    if (
      draggedIndex.value !== null &&
      draggedIndex.value !== index &&
      dragType.value === type
    ) {
      dropTargetIndex.value = index
    }
  }

  /**
   * Handles drag over event (required for drop to work)
   */
  function handleDragOver(event: DragEvent) {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }

  /**
   * Handles drop on a step item (reordering)
   */
  function handleDrop(index: number, type: DragDropTarget) {
    // Only process if we have a valid drag and it's not self-drop
    if (
      draggedIndex.value !== null &&
      draggedIndex.value !== index &&
      dragType.value === type
    ) {
      callbacks.onReorder(draggedIndex.value, index, type)
    }

    resetState()
  }

  /**
   * Handles drag end (cleanup)
   */
  function handleDragEnd() {
    resetState()
  }

  // =========================================================================
  // Handlers for catalog drop zone
  // =========================================================================

  /**
   * Handles drag over on the catalog drop zone
   */
  function handleCatalogDragOver(event: DragEvent) {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
    isDraggingFromCatalog.value = true
  }

  /**
   * Handles drag leave on the catalog drop zone
   */
  function handleCatalogDragLeave() {
    isDraggingFromCatalog.value = false
  }

  /**
   * Handles drop from the step catalog
   */
  function handleDropFromCatalog(event: DragEvent, target: DragDropTarget) {
    event.preventDefault()
    isDraggingFromCatalog.value = false

    const data = event.dataTransfer?.getData('application/json')
    if (!data) return

    try {
      const step = JSON.parse(data) as StepDefinition
      callbacks.onDropFromCatalog(step, target)
    } catch (error) {
      console.error('Failed to parse dropped step:', error)
    }
  }

  return {
    // State
    draggedIndex,
    dropTargetIndex,
    dragType,
    isDraggingFromCatalog,

    // Handlers
    handleDragStart,
    handleDragEnter,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    handleCatalogDragOver,
    handleCatalogDragLeave,
    handleDropFromCatalog,

    // Utility
    resetState,
    isDragging,
    isDropTarget,
    isDraggedItem,
  }
}
