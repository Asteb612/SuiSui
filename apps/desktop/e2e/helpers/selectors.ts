/**
 * Centralized data-testid selectors for E2E tests.
 * Avoids magic strings and makes refactoring easier.
 */
export const SEL = {
  // Layout
  mainContainer: '[data-testid="main-container"]',
  statusBar: '[data-testid="status-bar"]',

  // Workspace
  welcomeScreen: '[data-testid="welcome-screen"]',
  selectWorkspaceBtn: '[data-testid="select-workspace-btn"]',
  initWorkspaceBtn: '[data-testid="init-workspace-btn"]',

  // Feature tree
  featureTree: '[data-testid="feature-tree"]',
  featureTreeItem: '[data-testid="tree-node-item"]',
  featureTreeFile: '[data-testid="tree-node-file"]',
  featureTreeFolder: '[data-testid="tree-node-folder"]',
  featureCount: '[data-testid="feature-count"]',

  // Scenario builder
  scenarioBuilder: '[data-testid="scenario-builder"]',
  scenarioName: '[data-testid="scenario-name"]',
  scenarioStep: '[data-testid$="-step"]',

  // Step elements
  stepKeyword: '[data-testid="step-keyword"]',
  stepPattern: '[data-testid="step-pattern"]',
  stepArgs: '[data-testid="step-args"]',

  // Inline arg editing
  inlineArgInput: '[data-testid="inline-arg-input"]',
  inlineArgSelect: '[data-testid="inline-arg-select"]',
  inlineArgOutlineSelect: '[data-testid="inline-arg-outline-select"]',
  inlineArgInputBackground: '[data-testid="inline-arg-input-background"]',
  inlineArgSelectBackground: '[data-testid="inline-arg-select-background"]',

  // Step selector / catalog
  stepSelector: '[data-testid="step-selector"]',
  stepItem: '[data-testid="step-item"]',

  // Step row actions
  moveUpBtn: '[data-testid="move-up-btn"]',
  moveDownBtn: '[data-testid="move-down-btn"]',
  editBtn: '[data-testid="edit-btn"]',
  removeBtn: '[data-testid="remove-btn"]',

  // Step add dialog
  stepAddDialog: '[data-testid="step-add-dialog"]',

  // View mode controls
  editModeBtn: '[data-testid="edit-mode-btn"]',
  readModeBtn: '[data-testid="read-mode-btn"]',
  saveBtn: '[data-testid="save-btn"]',
  doneBtn: '[data-testid="done-btn"]',

  // Test runner view
  runTestsBtn: '[data-testid="run-tests-btn"]',
  quickRunBtn: '[data-testid="quick-run-btn"]',
  backToEditorBtn: '[data-testid="back-to-editor-btn"]',
  backToFiltersBtn: '[data-testid="back-to-filters-btn"]',
  executionSelector: '[data-testid="execution-selector"]',

  // Runner filters
  runnerMatchedCount: '[data-testid="runner-matched-count"]',
  filterTabFeatures: '[data-testid="filter-tab-features"]',
  filterTabFolders: '[data-testid="filter-tab-folders"]',
  filterTabTags: '[data-testid="filter-tab-tags"]',
  featureFilterItem: '[data-testid="feature-filter-item"]',
  featuresSelectAll: '[data-testid="features-select-all"]',
  featuresNoFilterHint: '[data-testid="features-no-filter-hint"]',
  tagFilterItem: '[data-testid="tag-filter-item"]',

  // Validation
  validationPanel: '[data-testid="validation-panel"]',
  validationIndicator: '[data-testid="validation-indicator"]',

  // Background
  backgroundSection: '[data-testid="background-section"]',

  // Dialogs
  newScenarioNameInput: '[data-testid="new-scenario-name-input"]',
  createScenarioButton: '[data-testid="create-scenario-button"]',

  // Run controls
  runHeadlessBtn: '[data-testid="run-headless-btn"]',
  runUiBtn: '[data-testid="run-ui-btn"]',
  stopRunBtn: '[data-testid="stop-run-btn"]',

  // Recorder (feature 007-native-recorder)
  recordBtn: '[data-testid="record-btn"]',
  recordBtnEmpty: '[data-testid="record-btn-empty"]',
  recordBtnGlobal: '[data-testid="record-btn-global"]',
  recorderPanel: '[data-testid="recorder-panel"]',
  recorderStart: '[data-testid="recorder-start"]',
  recorderStop: '[data-testid="recorder-stop"]',
  recorderConfirm: '[data-testid="recorder-confirm"]',
  recorderActions: '[data-testid="recorder-actions"]',
  recordedAction: '[data-testid="recorded-action"]',
  secretChip: '[data-testid="secret-chip"]',
  pickElement: '[data-testid="pick-element"]',
  locatorCandidate: '[data-testid="locator-candidate"]',
  candidateReliability: '[data-testid="candidate-reliability"]',
  assertPick: '[data-testid="assert-pick"]',
  assertType: '[data-testid="assert-type"]',
  assertAdd: '[data-testid="assert-add"]',

  // Git Clone
  gitCloneBtn: '[data-testid="git-clone-btn"]',
  gitCloneDialog: '[data-testid="git-clone-dialog"]',
  gitCloneUrlInput: '[data-testid="git-clone-url-input"]',
  gitCloneBranchInput: '[data-testid="git-clone-branch-input"]',
  gitCloneTokenInput: '[data-testid="git-clone-token-input"]',
  gitClonePathInput: '[data-testid="git-clone-path-input"]',
  gitCloneSubmitBtn: '[data-testid="git-clone-btn"]',
  gitCloneProgress: '[data-testid="git-clone-progress"]',
} as const
