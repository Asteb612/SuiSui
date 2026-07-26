import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import FeatureTree from '../components/FeatureTree.vue'
import TreeNodeItem from '../components/TreeNodeItem.vue'
import { primeVueStubs, createInitialStoreState } from './testUtils'
import { useWorkspaceStore } from '../stores/workspace'

// The tree (from createInitialStoreState) is: folder "auth"
// (auth/login.feature, auth/logout.feature) + a root file "home.feature".
const MenuStub = {
  name: 'Menu',
  template: '<div class="menu-stub" />',
  props: ['model', 'popup'],
  methods: { toggle() {} },
}

function renderTree() {
  return render(FeatureTree, {
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, initialState: createInitialStoreState({}) })],
      components: { TreeNodeItem },
      stubs: {
        ...primeVueStubs,
        Menu: MenuStub,
        NewScenarioDialog: { name: 'NewScenarioDialog', template: '<div />', props: ['visible'] },
      },
    },
  })
}

/** The draggable `.node-content` row for a node with the given relativePath. */
function rowFor(container: Element, path: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-path="${path}"] .node-content`)
  if (!el) throw new Error(`no row for ${path}`)
  return el
}

/** Expand a folder so its children render (folders start collapsed). */
async function expand(container: Element, folderPath: string) {
  const toggle = container.querySelector<HTMLElement>(`[data-path="${folderPath}"] .node-toggle`)
  if (toggle) await fireEvent.click(toggle)
}

/** The always-present root drop bar. */
function rootBar(container: Element): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-testid="feature-tree-root-dropbar"]')
  if (!el) throw new Error('no root drop bar')
  return el
}

describe('FeatureTree — drag & drop moves', () => {
  it('moves a root file into a folder (moveFeature)', async () => {
    const { container } = renderTree()
    const store = useWorkspaceStore()

    await fireEvent.dragStart(rowFor(container, 'home.feature'))
    await fireEvent.dragOver(rowFor(container, 'auth'))
    await fireEvent.drop(rowFor(container, 'auth'))

    expect(store.moveFeature).toHaveBeenCalledWith('home.feature', 'auth')
    expect(store.renameFolder).not.toHaveBeenCalled()
  })

  it('moves a file into its parent folder when dropped on a sibling file', async () => {
    const { container } = renderTree()
    const store = useWorkspaceStore()
    await expand(container, 'auth')

    // Drop root "home.feature" onto "auth/login.feature" → resolves to its parent folder "auth".
    await fireEvent.dragStart(rowFor(container, 'home.feature'))
    await fireEvent.drop(rowFor(container, 'auth/login.feature'))

    expect(store.moveFeature).toHaveBeenCalledWith('home.feature', 'auth')
  })

  it('does NOT move a file already in the target folder (no-op)', async () => {
    const { container } = renderTree()
    const store = useWorkspaceStore()
    await expand(container, 'auth')

    // auth/login.feature dropped onto folder auth (its current parent) → no move.
    await fireEvent.dragStart(rowFor(container, 'auth/login.feature'))
    await fireEvent.drop(rowFor(container, 'auth'))

    expect(store.moveFeature).not.toHaveBeenCalled()
  })

  it('does NOT move a folder into itself', async () => {
    const { container } = renderTree()
    const store = useWorkspaceStore()

    await fireEvent.dragStart(rowFor(container, 'auth'))
    await fireEvent.drop(rowFor(container, 'auth'))

    expect(store.renameFolder).not.toHaveBeenCalled()
  })

  it('reveals the root drop bar for a nested item and moves it to the root', async () => {
    const { container } = renderTree()
    const store = useWorkspaceStore()
    await expand(container, 'auth')

    // The bar is always in the DOM but only "visible" once a nested item is dragged.
    expect(rootBar(container).classList.contains('visible')).toBe(false)
    await fireEvent.dragStart(rowFor(container, 'auth/login.feature'))
    expect(rootBar(container).classList.contains('visible')).toBe(true)

    await fireEvent.dragOver(rootBar(container))
    await fireEvent.drop(rootBar(container))

    expect(store.moveFeature).toHaveBeenCalledWith('auth/login.feature', '')
  })

  it('does NOT reveal the root drop bar for a root-level item', async () => {
    const { container } = renderTree()
    await fireEvent.dragStart(rowFor(container, 'home.feature'))
    expect(rootBar(container).classList.contains('visible')).toBe(false)
  })
})
