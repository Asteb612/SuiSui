<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  tags: string[]
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:tags': [tags: string[]]
}>()

const newTag = ref('')
const isEditing = ref(false)

const displayTags = computed(() => props.tags)

function addTag() {
  const tag = newTag.value.trim().replace(/^@/, '')
  if (tag && !props.tags.includes(tag)) {
    emit('update:tags', [...props.tags, tag])
  }
  newTag.value = ''
  isEditing.value = false
}

function removeTag(tag: string) {
  emit('update:tags', props.tags.filter(t => t !== tag))
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    addTag()
  } else if (e.key === 'Escape') {
    newTag.value = ''
    isEditing.value = false
  }
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
      <InputText
        v-model="newTag"
        :placeholder="placeholder || 'Tag name...'"
        size="small"
        class="tag-input"
        @keydown="handleKeyDown"
        @blur="addTag"
      />
    </div>

    <Button
      v-else
      icon="pi pi-plus"
      text
      size="small"
      class="add-tag-btn"
      @click="isEditing = true"
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
}

.tag-input {
  width: 70px;
}

.tag-input :deep(input) {
  padding: 0.125rem 0.375rem;
  font-size: 0.6875rem;
  font-family: monospace;
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
