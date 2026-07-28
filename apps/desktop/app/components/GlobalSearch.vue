<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { SearchResult } from '@suisui/shared'
import { useSearchStore, type SearchTypeFilter } from '~/stores/search'

const emit = defineEmits<{ activate: [result: SearchResult] }>()

const searchStore = useSearchStore()

const inputRef = ref<{ $el?: HTMLElement } | HTMLInputElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
/** Where focus was before search was invoked, so Escape can restore it. */
let previousFocus: HTMLElement | null = null

const showPanel = computed(
  () => searchStore.isOpen && (searchStore.hasQuery || searchStore.isIndexing)
)

const activeDescendantId = computed(() =>
  showPanel.value && searchStore.visibleResults.length > 0
    ? `global-search-option-${searchStore.activeIndex}`
    : undefined
)

/** Polite live-region text: the outcome of the current query. */
const announcement = computed(() => {
  if (!searchStore.hasQuery) return ''
  if (searchStore.isIndexing) return 'Indexing workspace, please wait.'
  if (searchStore.isSearching) return ''
  const count = searchStore.visibleResults.length
  if (count === 0) return 'No results.'
  return `${count} result${count === 1 ? '' : 's'}.${
    searchStore.truncated ? ` Showing the first ${count} of ${searchStore.totalMatches}.` : ''
  }`
})

const filters: { label: string; value: SearchTypeFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Features', value: 'feature' },
  { label: 'Scenarios', value: 'scenario' },
]

/** Split display text into highlighted / plain segments using the match ranges. */
function segments(result: SearchResult): { text: string; match: boolean }[] {
  if (result.ranges.length === 0) return [{ text: result.text, match: false }]

  const out: { text: string; match: boolean }[] = []
  let cursor = 0
  for (const range of result.ranges) {
    if (range.start > cursor) {
      out.push({ text: result.text.slice(cursor, range.start), match: false })
    }
    out.push({ text: result.text.slice(range.start, range.end), match: true })
    cursor = range.end
  }
  if (cursor < result.text.length) {
    out.push({ text: result.text.slice(cursor), match: false })
  }
  return out
}

function resolveInputEl(): HTMLInputElement | null {
  const raw = inputRef.value
  if (!raw) return null
  if (raw instanceof HTMLInputElement) return raw
  const el = (raw as { $el?: HTMLElement }).$el
  if (el instanceof HTMLInputElement) return el
  return el?.querySelector('input') ?? null
}

function focusInput() {
  const active = document.activeElement
  // Never record our own input as "where the user was" — restoring it on Escape
  // would refocus the field, which re-opens the panel we just closed.
  previousFocus =
    active instanceof HTMLElement && !rootRef.value?.contains(active) ? active : null
  searchStore.open()
  void nextTick(() => {
    const el = resolveInputEl()
    el?.focus()
    el?.select()
  })
}

/**
 * True when the keystroke belongs to something else — another text field or an
 * open modal. The shortcut must yield rather than hijack typing (FR-002).
 */
function shouldIgnoreShortcut(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  if (target) {
    const tag = target.tagName
    const isOwnInput = rootRef.value?.contains(target) ?? false
    if (!isOwnInput && (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable)) {
      return true
    }
  }
  return document.querySelector('.p-dialog-mask, [role="dialog"]') !== null
}

function onGlobalKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    if (shouldIgnoreShortcut(event)) return
    event.preventDefault()
    focusInput()
  }
}

/**
 * Close the panel.
 *
 * `restoreFocus` is true for Escape (put the user back where they were) and
 * false for activation, where focus belongs to the destination content (FR-026).
 */
function dismiss(restoreFocus = true) {
  searchStore.close()
  resolveInputEl()?.blur()
  if (restoreFocus) previousFocus?.focus()
  previousFocus = null
}

function onInputKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'Escape':
      event.preventDefault()
      dismiss()
      break
    case 'ArrowDown':
      event.preventDefault()
      searchStore.moveActive(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      searchStore.moveActive(-1)
      break
    case 'Enter': {
      event.preventDefault()
      const result = searchStore.activeResult
      if (result) activate(result)
      break
    }
  }
}

function activate(result: SearchResult) {
  dismiss(false)
  // Clear the query too. Navigating re-renders the editor, and the browser can
  // hand focus back to this input afterwards — with a query still present that
  // would re-open the panel we just closed. Clearing also matches quick-open
  // conventions: the search has served its purpose once you have jumped.
  searchStore.setQuery('')
  emit('activate', result)
}

// Keep the highlighted row in view during keyboard navigation.
watch(
  () => searchStore.activeIndex,
  () => {
    void nextTick(() => {
      panelRef.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
    })
  }
)

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown)
  void searchStore.init()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
  searchStore.dispose()
})

defineExpose({ focusInput })
</script>

<template>
  <div
    ref="rootRef"
    class="global-search"
    data-testid="global-search"
  >
    <span class="p-input-icon-left search-field">
      <i class="pi pi-search search-icon" />
      <InputText
        ref="inputRef"
        :model-value="searchStore.query"
        class="search-input"
        placeholder="Search features and scenarios…"
        aria-label="Search features and scenarios by name or tag"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="global-search-listbox"
        :aria-expanded="showPanel"
        :aria-activedescendant="activeDescendantId"
        data-testid="global-search-input"
        @update:model-value="searchStore.setQuery($event ?? '')"
        @focus="searchStore.open()"
        @keydown="onInputKeydown"
      />
      <kbd class="search-kbd">Ctrl K</kbd>
    </span>

    <!-- Result counts are announced politely so screen-reader users learn the
         outcome of a query without having to arrow into the list. -->
    <span
      class="sr-only"
      role="status"
      aria-live="polite"
      data-testid="global-search-announcement"
    >{{ announcement }}</span>

    <div
      v-if="showPanel"
      ref="panelRef"
      class="search-panel"
      data-testid="global-search-panel"
    >
      <div
        v-if="searchStore.isIndexing"
        class="search-note"
        data-testid="global-search-indexing"
      >
        <i class="pi pi-spin pi-spinner" />
        <span>Indexing workspace…</span>
      </div>

      <template v-if="searchStore.hasQuery">
        <div
          v-if="searchStore.results.length > 0"
          class="search-filters"
        >
          <button
            v-for="filter in filters"
            :key="filter.value"
            type="button"
            class="filter-chip"
            :class="{ active: searchStore.typeFilter === filter.value }"
            :data-testid="`global-search-filter-${filter.value}`"
            @click="searchStore.setTypeFilter(filter.value)"
          >
            {{ filter.label }}
            <span class="filter-count">
              {{
                filter.value === 'all'
                  ? searchStore.results.length
                  : filter.value === 'feature'
                    ? searchStore.featureCount
                    : searchStore.scenarioCount
              }}
            </span>
          </button>
        </div>

        <div
          v-if="searchStore.showEmptyState"
          class="search-note"
          data-testid="global-search-empty"
        >
          No features or scenarios match “{{ searchStore.query }}”.
        </div>

        <div
          v-else-if="searchStore.isSearching && searchStore.results.length === 0"
          class="search-note subtle"
          data-testid="global-search-searching"
        >
          Searching…
        </div>

        <ul
          v-else
          id="global-search-listbox"
          class="result-list"
          role="listbox"
          aria-label="Search results"
        >
          <li
            v-for="(result, index) in searchStore.visibleResults"
            :id="`global-search-option-${index}`"
            :key="result.id"
            class="result-row"
            role="option"
            :class="{ active: index === searchStore.activeIndex }"
            :data-active="index === searchStore.activeIndex"
            :aria-selected="index === searchStore.activeIndex"
            :data-testid="`global-search-result-${index}`"
            @click="activate(result)"
            @mouseenter="searchStore.activeIndex = index"
          >
            <i
              class="result-icon pi"
              :class="result.type === 'feature' ? 'pi-file' : 'pi-list'"
            />
            <span class="result-main">
              <span class="result-title">
                <template v-if="result.text">
                  <span
                    v-for="(segment, i) in segments(result)"
                    :key="i"
                    :class="{ hl: segment.match }"
                  >{{ segment.text }}</span>
                </template>
                <span
                  v-else
                  class="result-untitled"
                >(untitled scenario)</span>
              </span>
              <span class="result-context">
                <span
                  v-if="result.type === 'scenario'"
                  class="result-feature"
                >{{ result.featureName }}</span>
                <span class="result-path">{{ result.relativePath }}</span>
              </span>
            </span>
            <span
              v-if="result.matchedField === 'tag' && result.matchedTag"
              class="result-tag"
              data-testid="global-search-matched-tag"
            >@{{ result.matchedTag }}</span>
          </li>
        </ul>

        <div
          v-if="searchStore.truncated"
          class="search-note subtle"
          data-testid="global-search-truncated"
        >
          Showing first {{ searchStore.results.length }} of {{ searchStore.totalMatches }} matches.
        </div>

        <div
          v-if="searchStore.hasUnparsedFiles"
          class="search-note subtle warn"
          data-testid="global-search-unparsed"
        >
          <i class="pi pi-exclamation-triangle" />
          <span>
            {{ searchStore.status.unparsedFiles.length }} file(s) could not be searched:
            {{ searchStore.status.unparsedFiles.join(', ') }}
          </span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.global-search {
  position: relative;
  flex: 0 1 22rem;
  min-width: 12rem;
}

.search-field {
  position: relative;
  display: block;
}

.search-icon {
  position: absolute;
  left: 0.6rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.8rem;
  opacity: 0.6;
  pointer-events: none;
  z-index: 1;
}

.search-input {
  width: 100%;
  padding-left: 2rem;
  padding-right: 3.5rem;
  height: 2rem;
  font-size: 0.85rem;
}

.search-kbd {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.65rem;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  border: 1px solid var(--surface-border);
  color: var(--text-color-secondary);
  opacity: 0.8;
  pointer-events: none;
}

.search-panel {
  position: absolute;
  top: calc(100% + 0.35rem);
  left: 0;
  right: 0;
  max-height: 26rem;
  overflow-y: auto;
  background: var(--surface-card);
  color: var(--text-color);
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgb(15 23 42 / 18%);
  z-index: 1000;
}

.search-filters {
  display: flex;
  gap: 0.35rem;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--surface-border);
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.5rem;
  font-size: 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--surface-border);
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
}

.filter-chip.active {
  background: var(--primary-color);
  color: #ffffff;
  border-color: transparent;
}

.filter-count {
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

.result-list {
  list-style: none;
  margin: 0;
  padding: 0.25rem 0;
}

.result-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.7rem;
  cursor: pointer;
}

.result-row.active {
  background: rgb(59 130 246 / 12%);
}

.result-icon {
  font-size: 0.8rem;
  opacity: 0.6;
  flex-shrink: 0;
}

.result-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.result-title {
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-title .hl {
  font-weight: 700;
  color: var(--primary-color);
}

.result-untitled {
  opacity: 0.5;
  font-style: italic;
}

.result-context {
  display: flex;
  gap: 0.4rem;
  font-size: 0.7rem;
  opacity: 0.6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-feature::after {
  content: '·';
  margin-left: 0.4rem;
}

.result-tag {
  font-size: 0.7rem;
  padding: 0.05rem 0.35rem;
  border-radius: 3px;
  border: 1px solid var(--surface-border);
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.search-note {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.6rem 0.7rem;
  font-size: 0.78rem;
}

.search-note.subtle {
  opacity: 0.65;
  font-size: 0.7rem;
  border-top: 1px solid var(--surface-border);
}

.search-note.warn {
  color: #b45309;
}
</style>
