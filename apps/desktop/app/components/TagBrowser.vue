<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { TagUsage } from '@suisui/shared'
import { useTagsStore } from '~/stores/tags'

const emit = defineEmits<{
  open: [usage: TagUsage]
  runTag: [tag: string]
}>()

const tagsStore = useTagsStore()

onMounted(() => {
  void tagsStore.init()
})

onUnmounted(() => {
  tagsStore.dispose()
})

// Always select, never toggle off: there is no use for "no tag selected" once
// the user has picked one, and a toggle makes re-clicking silently clear the
// detail pane.
function selectTag(name: string) {
  tagsStore.selectTag(name)
}
</script>

<template>
  <div
    class="tag-browser"
    data-testid="tag-browser"
  >
    <!-- Tag list -->
    <aside class="tag-list-pane">
      <div class="pane-header">
        <InputText
          :model-value="tagsStore.tagFilter"
          class="tag-filter"
          placeholder="Filter tags…"
          aria-label="Filter tags"
          data-testid="tag-filter"
          @update:model-value="tagsStore.setTagFilter($event ?? '')"
        />
        <div class="sort-toggle">
          <button
            type="button"
            class="sort-chip"
            :class="{ active: tagsStore.sortMode === 'count' }"
            data-testid="tag-sort-count"
            @click="tagsStore.setSortMode('count')"
          >
            Most used
          </button>
          <button
            type="button"
            class="sort-chip"
            :class="{ active: tagsStore.sortMode === 'alpha' }"
            data-testid="tag-sort-alpha"
            @click="tagsStore.setSortMode('alpha')"
          >
            A–Z
          </button>
        </div>
      </div>

      <div
        v-if="tagsStore.isIndexing"
        class="pane-note"
        data-testid="tag-indexing"
      >
        <i class="pi pi-spin pi-spinner" />
        <span>Indexing workspace…</span>
      </div>

      <div
        v-else-if="tagsStore.showEmptyState"
        class="pane-note"
        data-testid="tag-empty"
      >
        No tags found in this workspace.
      </div>

      <ul
        v-else
        class="tag-list"
        role="listbox"
        aria-label="Tags"
      >
        <li
          v-for="tag in tagsStore.visibleTags"
          :key="tag.name"
          class="tag-row"
          role="option"
          :class="{ active: tag.name === tagsStore.selectedTag }"
          :aria-selected="tag.name === tagsStore.selectedTag"
          :data-testid="`tag-row-${tag.name}`"
          @click="selectTag(tag.name)"
        >
          <span class="tag-name">@{{ tag.name }}</span>
          <span
            v-if="tag.orphaned"
            class="tag-orphan"
            title="Declared on a feature that contains no scenarios"
          >no scenarios</span>
          <span
            class="tag-count"
            :data-testid="`tag-count-${tag.name}`"
          >{{ tag.scenarioCount }}</span>
        </li>
      </ul>

      <div
        v-if="tagsStore.hasUnparsedFiles"
        class="pane-note warn"
        data-testid="tag-unparsed"
      >
        <i class="pi pi-exclamation-triangle" />
        <span>
          {{ tagsStore.index.unparsedFiles.length }} file(s) could not be read:
          {{ tagsStore.index.unparsedFiles.join(', ') }}
        </span>
      </div>
    </aside>

    <!-- Scenario detail -->
    <section class="detail-pane">
      <div
        v-if="!tagsStore.selectedTag"
        class="pane-note"
        data-testid="tag-no-selection"
      >
        Select a tag to see the scenarios that carry it.
      </div>

      <template v-else>
        <div class="detail-header">
          <h4 class="detail-title">
            @{{ tagsStore.selectedTag }}
            <span class="detail-count">
              {{ tagsStore.selectedSummary?.scenarioCount ?? 0 }} scenario(s)
            </span>
          </h4>
          <Button
            label="Run this tag"
            icon="pi pi-play"
            size="small"
            severity="success"
            :disabled="(tagsStore.selectedSummary?.scenarioCount ?? 0) === 0"
            :title="
              (tagsStore.selectedSummary?.scenarioCount ?? 0) === 0
                ? 'No scenarios carry this tag, so there is nothing to run'
                : 'Run every scenario carrying this tag'
            "
            data-testid="tag-run-btn"
            @click="emit('runTag', tagsStore.selectedTag)"
          />
        </div>

        <div
          v-if="tagsStore.selectedUsages.length === 0"
          class="pane-note"
          data-testid="tag-no-scenarios"
        >
          No scenarios carry this tag. It is declared on a feature that contains none.
        </div>

        <ul
          v-else
          class="usage-list"
        >
          <li
            v-for="usage in tagsStore.selectedUsages"
            :key="usage.id"
            class="usage-row"
            :data-testid="`tag-usage-${usage.id}`"
            @click="emit('open', usage)"
          >
            <span class="usage-main">
              <span class="usage-name">
                {{ usage.scenarioName || '(untitled scenario)' }}
              </span>
              <span class="usage-context">
                <span class="usage-feature">{{ usage.featureName }}</span>
                <span class="usage-path">{{ usage.relativePath }}</span>
              </span>
            </span>
            <span
              class="usage-origin"
              :class="usage.origin"
              :title="
                usage.origin === 'inherited'
                  ? 'Declared on the feature, so it applies to every scenario in it'
                  : 'Declared directly on this scenario'
              "
              :data-testid="`tag-origin-${usage.id}`"
            >{{ usage.origin }}</span>
          </li>
        </ul>
      </template>
    </section>
  </div>
</template>

<style scoped>
.tag-browser {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--surface-card);
  color: var(--text-color);
}

.tag-list-pane {
  width: 20rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--surface-border);
}

.pane-header {
  padding: 0.6rem;
  border-bottom: 1px solid var(--surface-border);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tag-filter {
  width: 100%;
  height: 2rem;
  font-size: 0.85rem;
}

.sort-toggle {
  display: flex;
  gap: 0.35rem;
}

.sort-chip {
  padding: 0.15rem 0.5rem;
  font-size: 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--surface-border);
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
}

.sort-chip.active {
  background: var(--primary-color);
  color: #ffffff;
  border-color: transparent;
}

.tag-list,
.usage-list {
  list-style: none;
  margin: 0;
  padding: 0.25rem 0;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
  font-size: 0.85rem;
}

.tag-row.active {
  background: rgb(59 130 246 / 12%);
}

.tag-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-orphan {
  font-size: 0.65rem;
  color: var(--text-color-secondary);
  font-style: italic;
}

.tag-count {
  font-variant-numeric: tabular-nums;
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  min-width: 1.5rem;
  text-align: right;
}

.detail-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0.8rem;
  border-bottom: 1px solid var(--surface-border);
}

.detail-title {
  font-size: 0.95rem;
  font-weight: 600;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.detail-count {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--text-color-secondary);
}

.usage-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.8rem;
  cursor: pointer;
}

.usage-row:hover {
  background: rgb(59 130 246 / 8%);
}

.usage-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.usage-name {
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.usage-context {
  display: flex;
  gap: 0.4rem;
  font-size: 0.7rem;
  color: var(--text-color-secondary);
}

.usage-feature::after {
  content: '·';
  margin-left: 0.4rem;
}

.usage-origin {
  font-size: 0.65rem;
  padding: 0.05rem 0.35rem;
  border-radius: 3px;
  border: 1px solid var(--surface-border);
  color: var(--text-color-secondary);
  flex-shrink: 0;
}

.usage-origin.inherited {
  font-style: italic;
}

.pane-note {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.8rem;
  font-size: 0.78rem;
  color: var(--text-color-secondary);
}

.pane-note.warn {
  color: #b45309;
  border-top: 1px solid var(--surface-border);
}
</style>
