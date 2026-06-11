/**
 * A deleted feature file or folder that has been moved to the recoverable trash
 * bin instead of being permanently removed.
 */
export interface TrashEntry {
  /** Unique identifier for this trash entry (also the trash subfolder name). */
  id: string
  /** Whether the deleted item was a single feature file or a folder. */
  type: 'file' | 'folder'
  /** Display name (file name without extension, or folder name). */
  name: string
  /** Original path relative to the features directory, used for restore. */
  originalPath: string
  /** The on-disk name of the item as stored inside the trash subfolder. */
  storedName: string
  /** ISO timestamp of when the item was deleted. */
  deletedAt: string
}
