# Contract: Step Catalog JSON Schema (v1)

**Feature**: 006-step-catalog | **Phase**: 1
The `StepCatalogResult` is the versioned, JSON-serializable artifact returned over IPC and persisted in the cache (FR-003/011). `schemaVersion` is `1`; bump on any breaking change and invalidate caches (FR-024).

## Shape (informative JSON Schema)

```jsonc
{
  "$id": "suisui.step-catalog.result.v1",
  "type": "object",
  "required": [
    "schemaVersion",
    "steps",
    "diagnostics",
    "generatedAt",
    "workspacePath",
    "analyzedFiles",
    "durationMs",
  ],
  "properties": {
    "schemaVersion": { "const": 1 },
    "generatedAt": { "type": "string", "format": "date-time" },
    "workspacePath": { "type": "string" },
    "configPath": { "type": "string" },
    "analyzedFiles": { "type": "integer", "minimum": 0 },
    "durationMs": { "type": "number", "minimum": 0 },
    "diagnostics": { "type": "array", "items": { "$ref": "#/$defs/diagnostic" } },
    "steps": { "type": "array", "items": { "$ref": "#/$defs/step" } },
  },
  "$defs": {
    "location": {
      "type": "object",
      "required": ["file", "line", "column"],
      "properties": {
        "file": { "type": "string" }, // workspace-relative, POSIX
        "line": { "type": "integer", "minimum": 1 },
        "column": { "type": "integer", "minimum": 1 },
      },
    },
    "diagnostic": {
      "type": "object",
      "required": ["code", "severity", "message"],
      "properties": {
        "code": {
          "enum": [
            "DYNAMIC_STEP_PATTERN",
            "UNRESOLVED_IDENTIFIER",
            "UNSUPPORTED_PATTERN_EXPRESSION",
            "UNSUPPORTED_REGEX_GROUP",
            "PARAMETER_COUNT_MISMATCH",
            "PARAMETER_TYPE_CONFLICT",
            "DUPLICATE_STEP_PATTERN",
            "AMBIGUOUS_STEP_PATTERN",
            "MISSING_CALLBACK",
            "UNRESOLVED_STEP_KEYWORD",
            "INVALID_DEFINE_STEP_METADATA",
            "FILE_PARSE_ERROR",
          ],
        },
        "severity": { "enum": ["info", "warning", "error"] },
        "message": { "type": "string" },
        "location": { "$ref": "#/$defs/location" },
      },
    },
    "parameter": {
      "type": "object",
      "required": ["index", "name", "type", "required", "origin", "precision"],
      "properties": {
        "index": { "type": "integer", "minimum": 0 },
        "name": { "type": "string" },
        "type": {
          "enum": [
            "string",
            "int",
            "float",
            "word",
            "any",
            "boolean",
            "enum",
            "table",
            "doc-string",
            "custom",
            "unknown",
          ],
        },
        "required": { "type": "boolean" },
        "enumValues": { "type": "array", "items": { "type": "string" }, "minItems": 2 },
        "tableColumns": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
        "label": { "type": "string" },
        "description": { "type": "string" },
        "example": { "type": "string" },
        "defaultValue": { "type": "string" },
        "origin": { "enum": ["suisui", "typescript", "pattern", "runtime"] },
        "precision": { "enum": ["exact", "inferred", "partial", "unknown"] },
        "sourceType": { "type": "string" },
      },
    },
    "step": {
      "type": "object",
      "required": [
        "id",
        "keyword",
        "pattern",
        "tags",
        "parameters",
        "fixtures",
        "source",
        "origin",
        "precision",
        "diagnostics",
      ],
      "properties": {
        "id": { "type": "string", "pattern": "^step_[0-9a-f]{12}$" },
        "keyword": { "enum": ["Given", "When", "Then"] },
        "pattern": {
          "type": "object",
          "required": ["kind", "source"],
          "properties": {
            "kind": {
              "enum": [
                "cucumber",
                "regexp",
                "plain-string",
                "suisui-template",
                "dynamic",
                "unknown",
              ],
            },
            "source": { "type": "string" },
            "flags": { "type": "string" }, // present iff kind==="regexp"
          },
        },
        "title": { "type": "string" },
        "description": { "type": "string" },
        "category": { "type": "string" },
        "tags": { "type": "array", "items": { "type": "string" } },
        "parameters": { "type": "array", "items": { "$ref": "#/$defs/parameter" } },
        "fixtures": { "type": "array", "items": { "type": "string" } },
        "source": { "$ref": "#/$defs/location" },
        "origin": { "enum": ["suisui", "typescript", "pattern", "runtime"] },
        "precision": { "enum": ["exact", "inferred", "partial", "unknown"] },
        "diagnostics": { "type": "array", "items": { "$ref": "#/$defs/diagnostic" } },
      },
    },
  },
}
```

## Cross-field invariants (enforced in engine, asserted in tests)

1. `pattern.flags` is present **iff** `pattern.kind === "regexp"`.
2. `parameters[i].index === i` for all `i`.
3. `enumValues` present ⟺ `type === "enum"`; `tableColumns` present ⟺ `type === "table"`.
4. `pattern.kind === "dynamic"` ⟹ at least one `DYNAMIC_STEP_PATTERN` diagnostic and `precision ∈ {partial, unknown}`.
5. `id` matches `^step_[0-9a-f]{12}$` and is stable for an unchanged, un-moved step (FR-021).
6. Every enum string in `code` belongs to the closed `DiagnosticCode` union (renderer badge mapping is exhaustive).
7. The entire object round-trips through `JSON.parse(JSON.stringify(result))` unchanged (FR-003; no `undefined`-only keys, no functions, no class instances).

## Example (illustrative)

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-07-24T10:00:00.000Z",
  "workspacePath": "/home/user/project",
  "configPath": "playwright.config.ts",
  "analyzedFiles": 7,
  "durationMs": 812,
  "diagnostics": [],
  "steps": [
    {
      "id": "step_4ce7289bfda1",
      "keyword": "When",
      "pattern": {
        "kind": "suisui-template",
        "source": "I fill {string:field} with {string:value}",
      },
      "title": "Fill a form field",
      "description": "Fills a visible form field with a value.",
      "category": "Form",
      "tags": ["form", "input"],
      "parameters": [
        {
          "index": 0,
          "name": "field",
          "type": "string",
          "required": true,
          "label": "Field",
          "example": "Email",
          "origin": "suisui",
          "precision": "exact",
        },
        {
          "index": 1,
          "name": "value",
          "type": "string",
          "required": true,
          "label": "Value",
          "example": "john@example.com",
          "origin": "suisui",
          "precision": "exact",
        },
      ],
      "fixtures": ["page"],
      "source": { "file": "tests/steps/form.steps.ts", "line": 42, "column": 1 },
      "origin": "suisui",
      "precision": "exact",
      "diagnostics": [],
    },
    {
      "id": "step_9a1b2c3d4e5f",
      "keyword": "Then",
      "pattern": {
        "kind": "regexp",
        "source": "^the user sees (success|error) message \"([^\"]+)\"$",
        "flags": "",
      },
      "tags": [],
      "parameters": [
        {
          "index": 0,
          "name": "arg0",
          "type": "enum",
          "required": true,
          "enumValues": ["success", "error"],
          "origin": "pattern",
          "precision": "partial",
        },
        {
          "index": 1,
          "name": "arg1",
          "type": "string",
          "required": true,
          "origin": "pattern",
          "precision": "partial",
        },
      ],
      "fixtures": ["page"],
      "source": { "file": "tests/steps/messages.steps.ts", "line": 12, "column": 1 },
      "origin": "pattern",
      "precision": "partial",
      "diagnostics": [
        {
          "code": "UNSUPPORTED_REGEX_GROUP",
          "severity": "info",
          "message": "Parameter names were inferred from the callback.",
        },
      ],
    },
  ],
}
```
