<script setup lang="ts">
import { ref, watch } from 'vue'

interface TableRow {
  [key: string]: string
}

const props = defineProps<{
  modelValue: TableRow[]
  columns: string[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TableRow[]]
}>()

const rows = ref<TableRow[]>([])

// Watch modelValue changes
watch(
  () => props.modelValue,
  (newValue) => {
    rows.value = Array.isArray(newValue) ? [...newValue] : []
  },
  { immediate: true, deep: true }
)

function addRow() {
  const newRow: TableRow = {}
  props.columns.forEach((col) => {
    newRow[col] = ''
  })
  rows.value.push(newRow)
  emitUpdate()
}

function removeRow(index: number) {
  rows.value.splice(index, 1)
  emitUpdate()
}

function updateCell(rowIndex: number, column: string, value: string | undefined) {
  const row = rows.value[rowIndex]
  if (row && value !== undefined) {
    row[column] = value
    emitUpdate()
  }
}

function emitUpdate() {
  emit('update:modelValue', rows.value)
}
</script>

<template>
  <div class="table-editor">
    <div
      v-if="rows.length === 0"
      class="empty-table"
    >
      <p>No rows yet. Click "Add Row" to add data.</p>
    </div>

    <div
      v-else
      class="table-wrapper"
    >
      <table class="data-table">
        <thead>
          <tr>
            <th
              v-for="col in columns"
              :key="col"
              class="column-header"
            >
              {{ col }}
            </th>
            <th class="actions-header">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, rowIndex) in rows"
            :key="rowIndex"
            class="table-row"
          >
            <td
              v-for="col in columns"
              :key="`${rowIndex}-${col}`"
              class="table-cell"
            >
              <InputText
                :model-value="row[col] ?? ''"
                size="small"
                @update:model-value="updateCell(rowIndex, col, $event)"
              />
            </td>
            <td class="actions-cell">
              <Button
                icon="pi pi-trash"
                text
                severity="danger"
                size="small"
                title="Remove row"
                @click="removeRow(rowIndex)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Button
      icon="pi pi-plus"
      label="Add Row"
      text
      size="small"
      class="add-row-btn"
      @click="addRow"
    />
  </div>
</template>

<style scoped>
.table-editor {
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  padding: 0.75rem;
  background: var(--surface-ground);
}

.empty-table {
  padding: 1rem;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 0.875rem;
}

.table-wrapper {
  overflow-x: auto;
  margin-bottom: 0.5rem;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.column-header {
  background: var(--surface-border);
  padding: 0.5rem;
  text-align: left;
  font-weight: 600;
  border: 1px solid var(--surface-border);
}

.actions-header {
  width: 60px;
  background: var(--surface-border);
  padding: 0.5rem;
  text-align: center;
  font-weight: 600;
  border: 1px solid var(--surface-border);
}

.table-row {
  border-bottom: 1px solid var(--surface-border);
}

.table-row:hover {
  background: rgba(59, 130, 246, 0.05);
}

.table-cell {
  padding: 0.5rem;
  border: 1px solid var(--surface-border);
}

.table-cell :deep(input) {
  width: 100%;
}

.actions-cell {
  padding: 0.5rem;
  text-align: center;
  border: 1px solid var(--surface-border);
  width: 60px;
}

.add-row-btn {
  margin-top: 0.5rem;
}
</style>
