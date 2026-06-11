import { useScenarioStore } from '~/stores/scenario'

/**
 * Actions that should NOT push an undo snapshot. These are either history
 * internals, lifecycle/serialization actions that reset state wholesale, or
 * non-mutating actions like tab switching.
 */
const NON_RECORDED_ACTIONS = new Set([
  'snapshotState',
  'restoreSnapshot',
  'recordHistory',
  'undo',
  'redo',
  'clearHistory',
  'setActiveScenario',
  'validate',
  'save',
  'toGherkin',
  'loadFromFeature',
  'parseGherkin',
  'clear',
  'createNew',
])

/**
 * Wires automatic undo/redo history capture for the scenario store. Before each
 * mutating action runs, the prior state is recorded so it can be undone.
 */
export default defineNuxtPlugin(() => {
  const scenarioStore = useScenarioStore()

  scenarioStore.$onAction(({ name }) => {
    if (!NON_RECORDED_ACTIONS.has(name)) {
      scenarioStore.recordHistory(name)
    }
  })
})
