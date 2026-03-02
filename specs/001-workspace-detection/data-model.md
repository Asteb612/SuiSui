# Data Model: Improve Workspace Detection & File Safety

**Feature**: 001-workspace-detection
**Date**: 2026-03-02

## Entities

No new entities introduced. This feature modifies behavior of existing entities.

### Existing Entities (unchanged)

#### Workspace

| Attribute       | Type    | Description                  |
| --------------- | ------- | ---------------------------- |
| path            | string  | Absolute filesystem path     |
| name            | string  | Directory basename           |
| isValid         | boolean | Passes all validation checks |
| hasPackageJson  | boolean | package.json exists          |
| hasFeaturesDir  | boolean | Features directory exists    |
| hasCucumberJson | boolean | cucumber.json exists         |

#### WorkspaceValidation

| Attribute | Type     | Description                                  |
| --------- | -------- | -------------------------------------------- |
| isValid   | boolean  | True when no errors found                    |
| errors    | string[] | List of specific validation failure messages |

#### WorkspaceMetadata (Git)

| Attribute     | Type   | Description                |
| ------------- | ------ | -------------------------- |
| owner         | string | Repository owner           |
| repo          | string | Repository name            |
| branch        | string | Current branch             |
| remoteUrl     | string | Origin remote URL          |
| lastPulledOid | string | Last known HEAD commit OID |

## Behavioral Changes

### ensurePackageJsonScripts — Script Merge Logic

**Before**: SuiSui scripts overwrite user scripts with the same name.

```
Input:  user has { "test": "jest", "lint": "eslint ." }
        SuiSui wants { "test": "bddgen && playwright test", "bddgen": "bddgen" }
Result: { "test": "bddgen && playwright test", "lint": "eslint .", "bddgen": "bddgen" }
        ^^^ user's "test" script OVERWRITTEN
```

**After**: SuiSui only adds scripts whose names don't already exist.

```
Input:  user has { "test": "jest", "lint": "eslint ." }
        SuiSui wants { "test": "bddgen && playwright test", "bddgen": "bddgen" }
Result: { "test": "jest", "lint": "eslint .", "bddgen": "bddgen" }
        ^^^ user's "test" script PRESERVED, only "bddgen" added
```

## State Transitions

No new state transitions. Existing workspace lifecycle (init → validate → set → get) is unchanged.

## Validation Rules (existing, verified by new tests)

| Rule                        | Entity       | Behavior                                                                    |
| --------------------------- | ------------ | --------------------------------------------------------------------------- |
| Directory must exist        | Workspace    | validate() returns error "Directory does not exist"                         |
| Path must be a directory    | Workspace    | validate() returns error "Path is not a directory"                          |
| package.json required       | Workspace    | validate() returns error "Missing package.json"                             |
| Features dir required       | Workspace    | validate() returns error "Missing features/ directory" (or custom dir name) |
| cucumber.json required      | Workspace    | validate() returns error "Missing cucumber.json"                            |
| Malformed config → fallback | Config Files | detectFeaturesDir() falls back to "features"                                |
| SuiSui-managed vs custom    | Config Files | Only configs with "managed by SuiSui" or "defineBddConfig" are updated      |
