import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/vue'
import { setActivePinia, createPinia } from 'pinia'
import type { TagIndex } from '@suisui/shared'
import TagsEditor from '../components/TagsEditor.vue'
import { primeVueStubs } from './testUtils'

function makeIndex(names: string[]): TagIndex {
  return {
    state: 'ready',
    tags: names.map((name) => ({
      name,
      scenarioCount: 1,
      usedAtFeatureLevel: false,
      usedAtScenarioLevel: true,
      orphaned: false,
    })),
    usages: Object.fromEntries(names.map((name) => [name, []])),
    unparsedFiles: [],
    fileCount: 1,
    scenarioCount: 1,
  }
}

const getIndexMock = vi.fn<() => Promise<TagIndex>>()
const onIndexChangedMock = vi.fn(() => () => {})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  getIndexMock.mockResolvedValue(makeIndex(['smoke', 'critical', 'regression']))
  // Assign onto the real jsdom `window` rather than replacing it: testing-library
  // reads window.document internally, so stubbing the whole object breaks it.
  ;(window as unknown as { api: unknown }).api = {
    tags: { getIndex: getIndexMock, applyBulk: vi.fn(), onIndexChanged: onIndexChangedMock },
  }
})

async function setup(tags: string[] = []) {
  const utils = render(TagsEditor, {
    props: { tags },
    global: { stubs: primeVueStubs },
  })
  // Let the index load.
  await new Promise((resolve) => setTimeout(resolve, 0))
  return utils
}

/**
 * Find one element, failing loudly if it is missing.
 *
 * Note `container` from testing-library is an `Element`, not an `HTMLElement` —
 * hence the explicit typing here rather than casts at every call site.
 */
function el<T extends HTMLElement = HTMLElement>(container: Element, selector: string): T {
  const found = container.querySelector(selector)
  if (!found) throw new Error(`Expected to find "${selector}" in the rendered output`)
  return found as T
}

/** Open the inline editor and focus it, which populates suggestions. */
async function startEditing(container: Element) {
  await fireEvent.click(el(container, '.add-tag-btn'))
  // The component focuses the field after a tick, so let that settle before
  // querying for it.
  await new Promise((resolve) => setTimeout(resolve, 0))
  const input = el<HTMLInputElement>(container, '[data-testid="autocomplete-input"]')
  await fireEvent.focus(input)
  return input
}

function suggestionTexts(container: Element): string[] {
  return [...container.querySelectorAll('[data-testid="autocomplete-suggestions"] li')].map(
    (li) => li.textContent?.trim() ?? ''
  )
}

describe('TagsEditor — choosing an existing tag', () => {
  it('loads the workspace tag index on mount', async () => {
    await setup()
    expect(getIndexMock).toHaveBeenCalled()
  })

  it('offers every workspace tag when the field is empty', async () => {
    const { container } = await setup()
    await startEditing(container)
    expect(suggestionTexts(container)).toEqual(['smoke', 'critical', 'regression'])
  })

  it('filters suggestions as you type, ignoring a leading @', async () => {
    const { container } = await setup()
    const input = await startEditing(container)

    await fireEvent.update(input, '@crit')
    expect(suggestionTexts(container)).toEqual(['critical'])
  })

  it('does not offer tags already applied here', async () => {
    const { container } = await setup(['smoke'])
    await startEditing(container)
    expect(suggestionTexts(container)).toEqual(['critical', 'regression'])
  })

  it('adds the tag when a suggestion is clicked', async () => {
    const { container, emitted } = await setup(['smoke'])
    await startEditing(container)

    await fireEvent.click(el(container, '[data-testid="suggestion-critical"]'))
    expect(emitted()['update:tags']?.[0]).toEqual([['smoke', 'critical']])
  })
})

describe('TagsEditor — creating a new tag', () => {
  it('adds a tag that does not exist in the workspace yet', async () => {
    const { container, emitted } = await setup()
    const input = await startEditing(container)

    await fireEvent.update(input, 'brand-new')
    await fireEvent.keyDown(input, { key: 'Enter' })

    expect(emitted()['update:tags']?.[0]).toEqual([['brand-new']])
  })

  it('strips a leading @ from typed input', async () => {
    const { container, emitted } = await setup()
    const input = await startEditing(container)

    await fireEvent.update(input, '@typed')
    await fireEvent.keyDown(input, { key: 'Enter' })

    expect(emitted()['update:tags']?.[0]).toEqual([['typed']])
  })

  it('flags and refuses a name that is not a usable tag', async () => {
    const { container, emitted } = await setup()
    const input = await startEditing(container)

    // Same rule the bulk editor and the IPC boundary enforce — a tag with a
    // space would split into two on the next parse.
    await fireEvent.update(input, 'two words')
    expect(container.querySelector('[data-testid="tag-invalid"]')).toBeTruthy()

    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(emitted()['update:tags']).toBeUndefined()
  })

  it('does not add a duplicate of a tag already applied', async () => {
    const { container, emitted } = await setup(['smoke'])
    const input = await startEditing(container)

    await fireEvent.update(input, 'smoke')
    await fireEvent.keyDown(input, { key: 'Enter' })

    expect(emitted()['update:tags']).toBeUndefined()
  })

  it('discards the typed text on Escape', async () => {
    const { container, emitted } = await setup()
    const input = await startEditing(container)

    await fireEvent.update(input, 'abandoned')
    await fireEvent.keyDown(input, { key: 'Escape' })

    expect(emitted()['update:tags']).toBeUndefined()
    expect(container.querySelector('[data-testid="autocomplete-input"]')).toBeNull()
  })
})

describe('TagsEditor — existing behaviour is preserved', () => {
  it('renders the applied tags with their @ prefix', async () => {
    const { container } = await setup(['smoke', 'critical'])
    expect([...container.querySelectorAll('.tag span')].map((s) => s.textContent)).toEqual([
      '@smoke',
      '@critical',
    ])
  })

  it('removes a tag without touching the others', async () => {
    const { container, emitted } = await setup(['smoke', 'critical'])
    await fireEvent.click(container.querySelectorAll('.tag button')[0] as HTMLElement)
    expect(emitted()['update:tags']?.[0]).toEqual([['critical']])
  })
})
