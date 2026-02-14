import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import GitPanel from '../components/GitPanel.vue'
import { primeVueStubs, createMockGitStatus } from './testUtils'
import { useGitStore } from '../stores/git'

function createWrapper(storeOverrides: Record<string, unknown> = {}) {
  return render(GitPanel, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          initialState: {
            git: {
              status: createMockGitStatus(),
              isLoading: false,
              error: null,
              isPulling: false,
              isPushing: false,
              lastMessage: null,
              hasChanges: false,
              branchName: 'main',
              ...storeOverrides,
            },
          },
        }),
      ],
      stubs: primeVueStubs,
    },
  })
}

describe('GitPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders git panel container', () => {
      const { container } = createWrapper()
      expect(container.querySelector('.git-panel')).toBeTruthy()
    })

    it('displays branch name', () => {
      createWrapper({ status: createMockGitStatus({ branch: 'feature/test' }) })
      expect(screen.getByText('feature/test')).toBeTruthy()
    })

    it('renders Pull button when remote exists', () => {
      createWrapper({ status: createMockGitStatus({ hasRemote: true }) })
      expect(screen.getByText('Pull')).toBeTruthy()
    })

    it('does not render Pull button when no remote', () => {
      createWrapper({ status: createMockGitStatus({ hasRemote: false }) })
      expect(screen.queryByText('Pull')).toBeNull()
    })

    it('renders Commit & Push button when remote exists', () => {
      createWrapper({ status: createMockGitStatus({ hasRemote: true }) })
      expect(screen.getByText('Commit & Push')).toBeTruthy()
    })

    it('renders Commit button when no remote', () => {
      createWrapper({ status: createMockGitStatus({ hasRemote: false }) })
      expect(screen.getByText('Commit')).toBeTruthy()
    })
  })

  describe('branch status', () => {
    it('displays branch icon', () => {
      const { container } = createWrapper()
      expect(container.querySelector('.pi-code-branch')).toBeTruthy()
    })

    it('shows ahead count when ahead of remote', () => {
      createWrapper({
        status: createMockGitStatus({ ahead: 3, hasRemote: true }),
      })

      expect(screen.getByText('3')).toBeTruthy()
    })

    it('shows behind count when behind remote', () => {
      createWrapper({
        status: createMockGitStatus({ behind: 2, hasRemote: true }),
      })

      expect(screen.getByText('2')).toBeTruthy()
    })

    it('shows both ahead and behind', () => {
      createWrapper({
        status: createMockGitStatus({ ahead: 1, behind: 2, hasRemote: true }),
      })

      expect(screen.getByText('1')).toBeTruthy()
      expect(screen.getByText('2')).toBeTruthy()
    })

    it('does not show sync status when at same commit', () => {
      const { container } = createWrapper({
        status: createMockGitStatus({ ahead: 0, behind: 0 }),
      })

      expect(container.querySelector('.sync-status')).toBeNull()
    })
  })

  describe('changes indicator', () => {
    it('shows changes indicator when there are changes', () => {
      createWrapper({
        hasChanges: true,
        status: createMockGitStatus({
          modified: ['file1.ts', 'file2.ts'],
          untracked: ['file3.ts'],
        }),
      })

      expect(screen.getByText('3 changes')).toBeTruthy()
    })

    it('does not show changes indicator when no changes', () => {
      const { container } = createWrapper({
        hasChanges: false,
        status: createMockGitStatus({
          modified: [],
          untracked: [],
        }),
      })

      expect(container.querySelector('.changes-indicator')).toBeNull()
    })
  })

  describe('pull action', () => {
    it('calls pull when Pull button clicked', async () => {
      createWrapper({ status: createMockGitStatus({ hasRemote: true }) })

      await fireEvent.click(screen.getByText('Pull'))

      const store = useGitStore()
      expect(store.pull).toHaveBeenCalled()
    })

    it('shows loading state when pulling', () => {
      createWrapper({ isPulling: true, status: createMockGitStatus({ hasRemote: true }) })

      expect(screen.getByText('Pull')).toBeTruthy()
    })
  })

  describe('commit and push', () => {
    it('disables Commit button when no changes (local repo)', () => {
      createWrapper({ status: createMockGitStatus({ modified: [], untracked: [], staged: [] }) })

      const button = screen.getByText('Commit')
      expect(button.closest('button')?.hasAttribute('disabled')).toBe(true)
    })

    it('enables Commit button when there are changes (local repo)', () => {
      createWrapper({ status: createMockGitStatus({ modified: ['file.ts'] }) })

      const button = screen.getByText('Commit')
      expect(button.closest('button')?.hasAttribute('disabled')).toBe(false)
    })

    it('opens commit dialog when button clicked', async () => {
      createWrapper({ status: createMockGitStatus({ modified: ['file.ts'] }) })

      await fireEvent.click(screen.getByText('Commit'))

      expect(screen.getByTestId('dialog')).toBeTruthy()
    })

    it('shows textarea for commit message in dialog', async () => {
      createWrapper({ status: createMockGitStatus({ modified: ['file.ts'] }) })

      await fireEvent.click(screen.getByText('Commit'))

      expect(screen.getByTestId('textarea')).toBeTruthy()
    })

    it('shows loading state when pushing', () => {
      createWrapper({ isPushing: true, status: createMockGitStatus({ hasRemote: true }) })

      expect(screen.getByText('Commit & Push')).toBeTruthy()
    })
  })

  describe('commit dialog', () => {
    it('has cancel button in dialog', async () => {
      createWrapper({ status: createMockGitStatus({ modified: ['file.ts'] }) })

      await fireEvent.click(screen.getByText('Commit'))

      expect(screen.getByText('Cancel')).toBeTruthy()
    })

    it('closes dialog when cancel clicked', async () => {
      createWrapper({ status: createMockGitStatus({ modified: ['file.ts'] }) })

      await fireEvent.click(screen.getByText('Commit'))
      await fireEvent.click(screen.getByText('Cancel'))

      expect(screen.queryByTestId('dialog')).toBeNull()
    })

    it('disables commit button when message is empty', async () => {
      const { container } = createWrapper({ status: createMockGitStatus({ modified: ['file.ts'] }) })

      await fireEvent.click(screen.getByText('Commit'))

      const dialog = container.querySelector('.p-dialog')
      const footerButtons = dialog?.querySelectorAll('button[data-testid="button"]')
      const submitButton = footerButtons?.[1]
      expect(submitButton?.hasAttribute('disabled')).toBe(true)
    })

    it('calls commitPush when dialog submit clicked', async () => {
      const { container } = createWrapper({ status: createMockGitStatus({ modified: ['file.ts'] }) })

      await fireEvent.click(screen.getByText('Commit'))

      const textarea = screen.getByTestId('textarea')
      await fireEvent.update(textarea, 'Test commit message')

      const dialog = container.querySelector('.p-dialog')
      const footerButtons = dialog?.querySelectorAll('button[data-testid="button"]')
      const submitButton = footerButtons?.[1]
      await fireEvent.click(submitButton!)

      const store = useGitStore()
      expect(store.commitPush).toHaveBeenCalledWith('Test commit message')
    })
  })

  describe('error display', () => {
    it('shows error message when error exists', () => {
      createWrapper({ error: 'Failed to push' })

      expect(screen.getByText('Failed to push')).toBeTruthy()
    })

    it('shows error icon', () => {
      const { container } = createWrapper({ error: 'Error message' })

      expect(container.querySelector('.git-error')).toBeTruthy()
      expect(container.querySelector('.pi-exclamation-triangle')).toBeTruthy()
    })

    it('does not show error when no error', () => {
      const { container } = createWrapper({ error: null })

      expect(container.querySelector('.git-error')).toBeNull()
    })
  })

  describe('success message', () => {
    it('shows success message', () => {
      createWrapper({ lastMessage: 'Pushed successfully' })

      expect(screen.getByText('Pushed successfully')).toBeTruthy()
    })

    it('does not show message when none', () => {
      const { container } = createWrapper({ lastMessage: null })

      expect(container.querySelector('.git-message')).toBeNull()
    })
  })

  describe('null status handling', () => {
    it('handles null status gracefully', () => {
      createWrapper({ status: null })

      expect(screen.queryByText('main')).toBeNull()
    })
  })
})
