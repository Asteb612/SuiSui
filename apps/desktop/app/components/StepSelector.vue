<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStepsStore } from '~/stores/steps'
import { useScenarioStore } from '~/stores/scenario'
import { useWorkspaceStore } from '~/stores/workspace'
import { formatStepPattern } from '~/utils/stepPatternFormatter'
import { filterCatalogSteps, stepMaxSeverity, stepSourceLabel } from '~/utils/catalogFilters'
import { catalogStepToStepDefinition } from '@suisui/shared'
import type { StepKeyword, StepDefinition, CatalogStep } from '@suisui/shared'

const stepsStore = useStepsStore()
const scenarioStore = useScenarioStore()
const workspaceStore = useWorkspaceStore()

const props = withDefaults(
  defineProps<{
    addTarget?: 'scenario' | 'background'
  }>(),
  {
    addTarget: 'scenario',
  }
)

const selectedKeyword = ref<StepKeyword>('Given')
const searchQuery = ref('')

// Catalog filters (feature 006-step-catalog, US3)
const categoryFilter = ref('')
const tagFilter = ref('')
const typeFilter = ref('')
const precisionFilter = ref('')

const keywords: StepKeyword[] = ['Given', 'When', 'Then']

const hasCatalog = computed(() => stepsStore.catalog.length > 0)

const hasFeatureSelected = computed(() => {
  return workspaceStore.selectedFeature !== null || scenarioStore.currentFeaturePath !== null
})

const filteredSteps = computed<StepDefinition[]>(() => {
  if (hasCatalog.value) {
    return filterCatalogSteps(stepsStore.catalog, {
      keyword: selectedKeyword.value,
      text: searchQuery.value,
      category: categoryFilter.value || undefined,
      tag: tagFilter.value || undefined,
      parameterType: typeFilter.value || undefined,
      precision: precisionFilter.value || undefined,
    }).map(catalogStepToStepDefinition)
  }

  // Legacy fallback (pre-catalog): keyword + text over exported steps.
  const steps = stepsStore.stepsByKeyword(selectedKeyword.value)
  if (!searchQuery.value) return steps
  const query = searchQuery.value.toLowerCase()
  return steps.filter((step) => step.pattern.toLowerCase().includes(query))
})

/** Rich catalog metadata for a rendered (adapted) step, if available. */
function catalogFor(id: string): CatalogStep | undefined {
  return stepsStore.catalogStepById(id)
}
function severityFor(id: string): string | null {
  const cat = catalogFor(id)
  return cat ? stepMaxSeverity(cat) : null
}
function sourceFor(id: string): string | null {
  const cat = catalogFor(id)
  return cat ? stepSourceLabel(cat) : null
}
function precisionFor(id: string): string | null {
  return catalogFor(id)?.precision ?? null
}
function titleFor(id: string): string | null {
  return catalogFor(id)?.title ?? null
}
function categoryFor(id: string): string | null {
  return catalogFor(id)?.category ?? null
}

function addStep(step: StepDefinition) {
  if (props.addTarget === 'background') {
    scenarioStore.addBackgroundStep(step.keyword, step.pattern, step.args)
  } else {
    scenarioStore.addStep(step.keyword, step.pattern, step.args)
  }
}

function handleDragStart(step: StepDefinition, event: DragEvent) {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/json', JSON.stringify(step))
  }
}

async function refreshSteps() {
  await stepsStore.generateCatalog()
}
</script>

<template>
  <div
    class="step-selector"
    data-testid="step-selector"
  >
    <div class="step-selector-header">
      <SelectButton
        v-model="selectedKeyword"
        :options="keywords"
        :allow-empty="false"
        size="small"
      />
      <Button
        icon="pi pi-refresh"
        text
        rounded
        size="small"
        :loading="stepsStore.isLoading"
        title="Refresh steps from bddgen"
        @click="refreshSteps"
      />
    </div>

    <div
      v-if="!hasFeatureSelected"
      class="empty-state no-feature-selected"
    >
      <i class="pi pi-file" />
      <p>No feature selected</p>
      <p class="hint">
        Select or create a feature file to add steps
      </p>
    </div>

    <template v-else>
      <div class="target-indicator">
        <i class="pi pi-arrow-right" />
        <span>Adding to: <strong>{{ addTarget === 'background' ? 'Background' : 'Scenario' }}</strong></span>
      </div>

      <div class="search-box">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText
            v-model="searchQuery"
            placeholder="Search steps..."
            size="small"
          />
        </IconField>
      </div>

      <!-- Catalog filters (feature 006-step-catalog, US3) -->
      <div
        v-if="hasCatalog"
        class="catalog-filters"
        data-testid="catalog-filters"
      >
        <Select
          v-if="stepsStore.catalogCategories.length"
          v-model="categoryFilter"
          :options="['', ...stepsStore.catalogCategories]"
          placeholder="Category"
          size="small"
          show-clear
          data-testid="filter-category"
        />
        <Select
          v-if="stepsStore.catalogTags.length"
          v-model="tagFilter"
          :options="['', ...stepsStore.catalogTags]"
          placeholder="Tag"
          size="small"
          show-clear
          data-testid="filter-tag"
        />
        <Select
          v-model="typeFilter"
          :options="['', ...stepsStore.catalogParameterTypes]"
          placeholder="Param type"
          size="small"
          show-clear
          data-testid="filter-type"
        />
        <Select
          v-model="precisionFilter"
          :options="['', ...stepsStore.catalogPrecisions]"
          placeholder="Precision"
          size="small"
          show-clear
          data-testid="filter-precision"
        />
      </div>

      <div
        v-if="stepsStore.error"
        class="error-message"
      >
        <i class="pi pi-exclamation-triangle" />
        {{ stepsStore.error }}
      </div>

      <div
        v-else-if="filteredSteps.length === 0"
        class="empty-state"
      >
        <p v-if="stepsStore.steps.length === 0">
          No steps loaded. Click refresh to export from bddgen.
        </p>
        <p v-else>
          No steps match your search.
        </p>
      </div>

      <ul
        v-else
        class="step-items"
      >
        <li
          v-for="step in filteredSteps"
          :key="step.id"
          :class="{ generic: step.isGeneric }"
          data-testid="step-item"
          draggable="true"
          @click="addStep(step)"
          @dragstart="handleDragStart(step, $event)"
        >
          <div class="step-pattern">
            <span class="keyword">{{ step.keyword }}</span>
            <span
              :aria-label="step.pattern"
              v-html="formatStepPattern(step.pattern).html"
            />
          </div>
          <div
            v-if="titleFor(step.id) || categoryFor(step.id)"
            class="catalog-title"
          >
            <span
              v-if="titleFor(step.id)"
              class="step-title"
              data-testid="step-title"
            >{{ titleFor(step.id) }}</span>
            <span
              v-if="categoryFor(step.id)"
              class="category-badge"
              data-testid="step-category"
            >{{ categoryFor(step.id) }}</span>
          </div>
          <div
            v-if="formatStepPattern(step.pattern).argDescriptions.length > 0"
            class="step-arg-descriptions"
          >
            <span
              v-for="(argDesc, index) in formatStepPattern(step.pattern).argDescriptions"
              :key="index"
              class="arg-desc"
              :class="{ 'enum-desc': argDesc.type === 'enum', 'table-desc': argDesc.type === 'table' }"
            >
              <template v-if="argDesc.type === 'enum' && argDesc.enumValues">
                {{ argDesc.name }}: {{ argDesc.enumValues.join(' | ') }}
              </template>
              <template v-else-if="argDesc.type === 'table' && argDesc.tableColumns">
                {{ argDesc.name }}: {{ argDesc.tableColumns.join(', ') }}
              </template>
            </span>
          </div>
          <!-- Catalog metadata: source, precision, diagnostics (US3) -->
          <div
            v-if="catalogFor(step.id)"
            class="catalog-meta"
          >
            <span
              v-if="sourceFor(step.id)"
              class="source-badge"
              data-testid="step-source"
            ><i class="pi pi-file-o" /> {{ sourceFor(step.id) }}</span>
            <span
              class="precision-badge"
              :class="`precision-${precisionFor(step.id)}`"
              data-testid="step-precision"
            >{{ precisionFor(step.id) }}</span>
            <span
              v-if="severityFor(step.id)"
              class="diagnostic-badge"
              :class="`severity-${severityFor(step.id)}`"
              data-testid="step-diagnostic"
              :title="catalogFor(step.id)!.diagnostics.map((d) => d.message).join('\n')"
            ><i class="pi pi-exclamation-circle" /> {{ catalogFor(step.id)!.diagnostics.length }}</span>
          </div>
          <span
            v-if="step.isGeneric"
            class="generic-badge"
          >Generic</span>
          <span
            v-if="step.decorator"
            class="decorator-badge"
          >@{{ step.decorator }}</span>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.step-selector {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  background: var(--surface-card);
}

.step-selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border-bottom: 1px solid var(--surface-border);
}

.target-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(59, 130, 246, 0.08);
  border-bottom: 1px solid var(--surface-border);
  font-size: 0.875rem;
  color: var(--text-color-secondary);
}

.target-indicator i {
  color: var(--primary-color);
}

.target-indicator strong {
  color: var(--primary-color);
  font-weight: 600;
}

.search-box {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--surface-border);
}

.search-box :deep(input) {
  width: 100%;
}

.error-message {
  padding: 1rem;
  color: #dc3545;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.empty-state {
  padding: 2rem;
  text-align: center;
  color: var(--text-color-secondary);
}

.no-feature-selected {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  flex: 1;
}

.no-feature-selected i {
  font-size: 3rem;
  opacity: 0.3;
  margin-bottom: 0.5rem;
}

.no-feature-selected .hint {
  font-size: 0.875rem;
  opacity: 0.7;
}

.step-items {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex: 1;
}

.step-items li {
  padding: 0.875rem 1rem;
  cursor: grab;
  border-bottom: 1px solid var(--surface-border);
  transition: background-color 0.15s;
  position: relative;
  line-height: 1.6;
}

.step-items li:active {
  cursor: grabbing;
}

.step-items li:hover {
  background-color: var(--surface-ground);
}

.step-items li.generic {
  background-color: rgba(59, 130, 246, 0.05);
}

.step-pattern {
  font-family: 'Courier New', Consolas, monospace;
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--text-color);
}

.keyword {
  font-weight: 600;
  color: var(--primary-color);
  margin-right: 0.5rem;
  display: inline-block;
  min-width: 65px;
  font-size: 0.875rem;
}

/* Pattern variable styles */
:deep(.pattern-variable) {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  font-weight: 600;
  margin: 0 0.125rem;
}

:deep(.pattern-enum) {
  background: rgba(139, 92, 246, 0.15);
  color: #8b5cf6;
}

:deep(.pattern-table) {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

:deep(.pattern-string),
:deep(.pattern-int),
:deep(.pattern-float),
:deep(.pattern-any) {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.step-arg-descriptions {
  margin-top: 0.375rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.arg-desc {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  padding-left: 4.5rem;
  font-family: monospace;
}

.arg-desc.enum-desc {
  color: #8b5cf6;
}

.arg-desc.table-desc {
  color: #22c55e;
}

.generic-badge,
.decorator-badge {
  position: absolute;
  right: 0.75rem;
  top: 0.75rem;
  font-size: 0.65rem;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
}

.generic-badge {
  background: var(--primary-color);
  color: white;
}

.decorator-badge {
  background: #6366f1;
  color: white;
}

/* Catalog filters + per-step metadata (feature 006-step-catalog, US3) */
.catalog-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding: 0 0.75rem 0.5rem;
}

.catalog-meta {
  margin-top: 0.375rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.7rem;
}

.source-badge {
  color: var(--text-color-secondary);
  font-family: monospace;
}

.precision-badge {
  padding: 0.05rem 0.35rem;
  border-radius: 3px;
  text-transform: capitalize;
  background: var(--surface-ground);
  color: var(--text-color-secondary);
}

.precision-badge.precision-exact {
  background: rgba(34, 197, 94, 0.15);
  color: #16a34a;
}

.precision-badge.precision-partial,
.precision-badge.precision-unknown {
  background: rgba(234, 179, 8, 0.15);
  color: #a16207;
}

.diagnostic-badge {
  padding: 0.05rem 0.35rem;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.diagnostic-badge.severity-info {
  background: rgba(59, 130, 246, 0.15);
  color: #2563eb;
}

.diagnostic-badge.severity-warning {
  background: rgba(234, 179, 8, 0.15);
  color: #a16207;
}

.diagnostic-badge.severity-error {
  background: rgba(239, 68, 68, 0.15);
  color: #dc2626;
}
</style>
