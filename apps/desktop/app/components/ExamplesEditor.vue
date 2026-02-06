<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ExampleTable } from '@suisui/shared'

const props = defineProps<{
  examples: ExampleTable
}>()

const emit = defineEmits<{
  'add-column': [column: string]
  'remove-column': [column: string]
  'add-row': []
  'remove-row': [index: number]
  'update-cell': [rowIndex: number, column: string, value: string]
}>()

const newColumnName = ref('')
const showAddColumn = ref(false)

const hasData = computed(() => props.examples.columns.length > 0)

function addColumn() {
  if (newColumnName.value.trim()) {
    emit('add-column', newColumnName.value.trim())
    newColumnName.value = ''
    showAddColumn.value = false
  }
}

function cancelAddColumn() {
  newColumnName.value = ''
  showAddColumn.value = false
}
</script>

<template>
  <div class="examples-editor">
    <div
      v-if="!hasData"
      class="examples-empty"
    >
      <p>No columns defined</p>
      <div class="add-column-inline">
        <InputText
          v-model="newColumnName"
          placeholder="Column name (e.g. role)"
          size="small"
          class="column-input"
          @keyup.enter="addColumn"
        />
        <Button
          icon="pi pi-plus"
          label="Add"
          size="small"
          :disabled="!newColumnName.trim()"
          @click="addColumn"
        />
      </div>
    </div>

    <div
      v-else
      class="examples-table-wrapper"
    >
      <div class="table-toolbar">
        <div
          v-if="showAddColumn"
          class="add-column-form"
        >
          <InputText
            v-model="newColumnName"
            placeholder="Column name..."
            size="small"
            class="column-input"
            @keyup.enter="addColumn"
            @keyup.escape="cancelAddColumn"
          />
          <Button
            icon="pi pi-check"
            text
            size="small"
            @click="addColumn"
          />
          <Button
            icon="pi pi-times"
            text
            size="small"
            severity="secondary"
            @click="cancelAddColumn"
          />
        </div>
        <Button
          v-else
          icon="pi pi-plus"
          label="Column"
          text
          size="small"
          @click="showAddColumn = true"
        />
      </div>

      <table class="examples-table">
        <thead>
          <tr>
            <th
              v-for="col in examples.columns"
              :key="col"
              class="column-header"
            >
              <div class="column-header-content">
                <span>&lt;{{ col }}&gt;</span>
                <Button
                  icon="pi pi-times"
                  text
                  rounded
                  size="small"
                  severity="danger"
                  class="remove-column-btn"
                  title="Remove column"
                  @click="$emit('remove-column', col)"
                />
              </div>
            </th>
            <th class="actions-header" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, rowIndex) in examples.rows"
            :key="rowIndex"
          >
            <td
              v-for="col in examples.columns"
              :key="col"
            >
              <InputText
                :model-value="row[col] || ''"
                placeholder="..."
                size="small"
                class="cell-input"
                @update:model-value="$emit('update-cell', rowIndex, col, $event as string)"
              />
            </td>
            <td class="row-actions">
              <Button
                icon="pi pi-trash"
                text
                rounded
                size="small"
                severity="danger"
                title="Remove row"
                @click="$emit('remove-row', rowIndex)"
              />
            </td>
          </tr>
        </tbody>
      </table>

      <Button
        icon="pi pi-plus"
        label="Row"
        text
        size="small"
        class="add-row-btn"
        @click="$emit('add-row')"
      />
    </div>
  </div>
</template>

<style scoped>
.examples-editor {
  background: var(--surface-ground);
}

.examples-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  color: var(--text-color-secondary);
  text-align: center;
  gap: 0.75rem;
}

.examples-empty p {
  margin: 0;
  font-size: 0.875rem;
}

.add-column-inline {
  display: flex;
  gap: 0.5rem;
}

.add-column-inline .column-input {
  width: 180px;
}

.examples-table-wrapper {
  padding: 0.5rem;
}

.table-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
}

.add-column-form {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.column-input {
  width: 120px;
}

.column-input :deep(input) {
  font-family: monospace;
  font-size: 0.75rem;
}

.examples-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.examples-table th,
.examples-table td {
  padding: 0.25rem;
  text-align: left;
}

.column-header {
  font-weight: 500;
}

.column-header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  background: rgba(139, 92, 246, 0.1);
  color: #8b5cf6;
  font-family: monospace;
  font-size: 0.75rem;
}

.remove-column-btn {
  opacity: 0;
  transition: opacity 0.15s;
  padding: 0.125rem !important;
  width: 1rem !important;
  height: 1rem !important;
}

.remove-column-btn :deep(.p-button-icon) {
  font-size: 0.625rem;
}

.column-header:hover .remove-column-btn {
  opacity: 1;
}

.actions-header {
  width: 32px;
}

.cell-input {
  width: 100%;
}

.cell-input :deep(input) {
  width: 100%;
  font-family: monospace;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
}

.row-actions {
  text-align: center;
}

.row-actions :deep(.p-button) {
  padding: 0.125rem !important;
  width: 1.25rem !important;
  height: 1.25rem !important;
}

.add-row-btn {
  margin-top: 0.25rem;
}
</style>
