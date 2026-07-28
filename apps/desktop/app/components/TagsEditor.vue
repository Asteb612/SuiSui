<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { isValidTagName, normalizeTagName } from '@suisui/shared'
import { useTagsStore } from '~/stores/tags'

const props = defineProps<{
  tags: string[]
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:tags': [tags: string[]]
}>()

const tagsStore = useTagsStore()

const newTag = ref('')
const isEditing = ref(false)
const suggestions = ref<string[]>([])
const autoCompleteRef = ref<{ $el?: HTMLElement } | null>(null)

const displayTags = computed(() => props.tags)

/** Workspace tags not already on this scenario/feature. */
const available = computed(() =>
  tagsStore.allTagNames.filter((name) => !props.tags.includes(name))
)

/** Typed text that is neither empty nor a usable tag name. */
const isInvalid = computed(
  () => newTag.value.trim().length > 0 && !isValidTagName(newTag.value)
)

/**
 * The index is shared with the tag browser and is refcounted, so mounting here
 * is safe even when the browser is open.
 */
onMounted(() => {
  void tagsStore.init()
})

onUnmounted(() => {
  tagsStore.dispose()
})

function search(event: { query: string }) {
  const needle = normalizeTagName(event.query).toLowerCase()
  suggestions.value = needle
    ? available.value.filter((name) => name.toLowerCase().includes(needle))
    : [...available.value]
}

function commit(raw: string) {
  const tag = normalizeTagName(raw)
  // Same rule the bulk editor and the IPC boundary enforce, so a tag typed here
  // can never be one that a later bulk operation would reject.
  if (tag && isValidTagName(tag) && !props.tags.includes(tag)) {
    emit('update:tags', [...props.tags, tag])
  }
  newTag.value = ''
  suggestions.value = []
  isEditing.value = false
}

function addTag() {
  commit(newTag.value)
}

/** Set briefly when a suggestion is picked, so the blur it causes is ignored. */
let justSelected = false

function onItemSelect(event: { value: string }) {
  justSelected = true
  commit(event.value)
}

/**
 * Commit whatever was typed when focus leaves, so a click elsewhere does not
 * silently discard it — but NOT when the blur was caused by clicking a
 * suggestion, which has already committed the right value.
 */
function onBlur() {
  setTimeout(() => {
    if (justSelected) {
      justSelected = false
      return
    }
    if (isEditing.value) addTag()
  }, 0)
}

function removeTag(tag: string) {
  emit('update:tags', props.tags.filter((t) => t !== tag))
}

/**
 * Enter commits the typed text — the "create a new tag" path. When a suggestion
 * is highlighted, AutoComplete consumes Enter itself and emits `item-select`
 * instead, so this only sees text the user is inventing.
 *
 * Handled here rather than with a `.enter` modifier: key modifiers are a native
 * DOM feature and are not applied to a component's custom `keydown` emit.
 */
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addTag()
    return
  }
  if (e.key === 'Escape') {
    newTag.value = ''
    suggestions.value = []
    isEditing.value = false
  }
}

async function startEditing() {
  isEditing.value = true
  await nextTick()
  const input = autoCompleteRef.value?.$el?.querySelector('input')
  input?.focus()
}
</script>

<template>
  <div class="tags-editor">
    <div
      v-for="tag in displayTags"
      :key="tag"
      class="tag"
    >
      <span>@{{ tag }}</span>
      <Button
        icon="pi pi-times"
        text
        rounded
        size="small"
        class="tag-remove"
        @click="removeTag(tag)"
      />
    </div>

    <div
      v-if="isEditing"
      class="tag-input-wrapper"
    >
      <AutoComplete
        ref="autoCompleteRef"
        v-model="newTag"
        :suggestions="suggestions"
        :placeholder="placeholder || 'Tag name...'"
        :invalid="isInvalid"
        size="small"
        class="tag-input"
        complete-on-focus
        dropdown
        dropdown-mode="current"
        :delay="0"
        empty-search-message="No matching tag — press Enter to create it"
        aria-label="Add a tag"
        data-testid="tag-autocomplete"
        @complete="search"
        @item-select="onItemSelect"
        @blur="onBlur"
        @keydown="handleKeyDown"
      />
      <small
        v-if="isInvalid"
        class="tag-invalid"
        data-testid="tag-invalid"
      >
        Letters, digits, _ - . : only
      </small>
    </div>

    <Button
      v-else
      icon="pi pi-plus"
      text
      size="small"
      class="add-tag-btn"
      title="Add an existing tag, or type a new one"
      data-testid="add-tag-btn"
      @click="startEditing"
    />
  </div>
</template>

<style scoped>
.tags-editor {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  min-height: 1.5rem;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  padding: 0.0625rem 0.25rem;
  padding-right: 0.0625rem;
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
  border-radius: 3px;
  font-size: 0.6875rem;
  font-family: monospace;
  line-height: 1.2;
}

.tag-remove {
  padding: 0 !important;
  width: 0.875rem !important;
  height: 0.875rem !important;
  opacity: 0.6;
}

.tag-remove:hover {
  opacity: 1;
}

.tag-remove :deep(.p-button-icon) {
  font-size: 0.5rem;
}

.tag-input-wrapper {
  display: inline-flex;
  flex-direction: column;
  gap: 0.125rem;
}

.tag-input {
  width: 11rem;
}

.tag-input :deep(input) {
  padding: 0.125rem 0.375rem;
  font-size: 0.6875rem;
  font-family: monospace;
  width: 100%;
}

.tag-input :deep(.p-autocomplete-dropdown) {
  padding: 0 0.25rem;
  width: 1.25rem;
}

.tag-invalid {
  font-size: 0.6rem;
  color: #b91c1c;
}

.add-tag-btn {
  padding: 0 0.25rem !important;
  font-size: 0.6875rem;
  opacity: 0.6;
}

.add-tag-btn:hover {
  opacity: 1;
}
</style>
