import { create } from 'zustand'

interface SearchModalOpenState {
  isOpen: boolean
}

/**
 * Browser-light projection of command-search visibility.
 *
 * Consumers that only need visibility must use this focused store instead of
 * importing the full search store, whose data initializer owns the Blocks,
 * Tools, and Triggers catalog closure.
 */
export const useSearchModalOpenStore = create<SearchModalOpenState>(() => ({
  isOpen: false,
}))

export function setSearchModalOpen(isOpen: boolean): void {
  useSearchModalOpenStore.setState({ isOpen })
}
