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
  runModeBtn: '[data-testid="run-mode-btn"]',
  saveBtn: '[data-testid="save-btn"]',
  doneBtn: '[data-testid="done-btn"]',

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

  // Git Clone
  gitCloneBtn: '[data-testid="git-clone-btn"]',
  gitCloneDialog: '[data-testid="git-clone-dialog"]',
  gitCloneUrlInput: '[data-testid="git-clone-url-input"]',
  gitCloneBranchInput: '[data-testid="git-clone-branch-input"]',
  gitCloneUsernameInput: '[data-testid="git-clone-username-input"]',
  gitClonePasswordInput: '[data-testid="git-clone-password-input"]',
  gitClonePathInput: '[data-testid="git-clone-path-input"]',
  gitCloneSubmitBtn: '[data-testid="git-clone-btn"]',
  gitCloneProgress: '[data-testid="git-clone-progress"]',
} as const
