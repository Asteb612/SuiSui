# Contract: `@suisui/step-regex` — `defineStep()`, fragment metadata, `bindSteps()`

**Feature**: 006-step-catalog | **Phase**: 1 (implemented in delivery Phase 4)
Additive, backward-compatible, **dependency-free** (Constitution + FR-029). Nothing here may pull a runtime dependency into `step-regex`.

## 1. Fragment metadata (extend `Frag`)

Today `Frag<T>` = `{ readonly text: string; readonly __t?: T }` and the interpolation helpers keep only `text`. Extend the helpers to also carry structured metadata:

```ts
export type FragmentKind =
  | 'string'
  | 'int'
  | 'float'
  | 'word'
  | 'any'
  | 'enum'
  | 'table'
  | 'optional'
  | 'alternative'

export interface Frag<T = never> {
  readonly text: string
  readonly __t?: T
  readonly meta?: {
    kind: FragmentKind
    name?: string
    enumValues?: string[]
    tableColumns?: string[]
    captures: boolean
  }
}
```

**Requirements**:

- `str/int/float/word/any` set `kind` accordingly, `captures: true`, `name` when provided.
- `oneOf(values)` → `kind:'enum'`, `enumValues`, `captures:true`.
- `cols(columns)` → `kind:'table'`, `tableColumns`, `captures:true`.
- `opt(text)` → `kind:'optional'`, `captures:false`. `alt(words)` → `kind:'alternative'`, `captures:false`.
- **Compatibility invariant**: `typeof step\`...\` === 'string'`MUST remain true. The assembled pattern is a primitive string; fragment metadata for the whole template is exposed via a side accessor (a module`WeakMap`/registry keyed by the string, or a non-enumerable symbol) — never by boxing the string. `playwright-bdd` continues to receive a plain string.

## 2. `defineStep()`

```ts
export interface StepParameterMeta {
  label?: string
  description?: string
  example?: string
  defaultValue?: string
}

export interface StepMetadata<A extends StepArgs = StepArgs> {
  pattern: StepPattern<A> // from step`` or a raw string
  title?: string
  description?: string
  category?: string
  tags?: string[]
  parameters?: Record<string, StepParameterMeta> // keyed by capture name
}

export function defineStep<A extends StepArgs>(meta: StepMetadata<A>): DefinedStep<A>
```

**`DefinedStep<A>` contract**:

- MUST be usable as the first argument of `playwright-bdd` `Given/When/Then` exactly where a pattern string/RegExp is accepted — i.e. **string-assignable** (its `toString()`/`valueOf()` yields `meta.pattern`, or it registers a side-table entry and _is_ the pattern string). Chosen representation MUST keep `Given(defineStep({...}), cb)` working at runtime under `playwright-bdd`.
- MUST expose `meta` for (a) static AST reading by the analyzer and (b) optional runtime-registry capture.
- MUST preserve the captured-arg tuple `A` so `bindSteps` can type the callback.

**Validation** (surfaced as diagnostics by the analyzer, not thrown at runtime):

- A key in `parameters` that does not correspond to a capture in `pattern` → `INVALID_DEFINE_STEP_METADATA`.
- `pattern` empty/missing → `INVALID_DEFINE_STEP_METADATA`.

## 3. `bindSteps()` overload

Existing:

```ts
When(step`I fill ${str('field')} with ${str('value')}`, async ({ page }, field, value) => {
  /* ... */
})
```

New — also accepts a `DefinedStep`:

```ts
const { Given, When, Then } = bindSteps(createBdd(test))
When(fillFieldStep, async ({ page }, field, value) => {
  /* field, value typed from A */
})
```

`bindSteps` stays the identity function at runtime; only the type overloads are added so a `DefinedStep<A>` infers callback args `A` after the fixtures object. No behavior change for existing `step`` usage.

## 4. Analyzer expectations (how the catalog reads these — static, no execution)

- `suisui-metadata` adapter recognizes a call to `defineStep({...})` in the AST, reads the object literal for `title/description/category/tags/parameters`, and reads the `pattern` property (which is itself a `step\`\``template or string literal) →`origin: 'suisui'`, `precision: 'exact'` for provided fields.
- `step\`...\``templates are read by walking the template + the`str()/int()/oneOf()/cols()/opt()/alt()`call expressions → fragment kinds/names/enum/columns →`origin: 'suisui'`(fragment),`precision: 'exact'` for name/type.
- Neither path executes project code; both rely on the AST only.

## 5. Non-goals for this contract

- No change to how patterns compile to regex (`patternToRegex` unchanged).
- No new runtime dependency; `sideEffects:false` and the dual ESM/CJS build stay intact.
- `defineStep` does **not** register steps by itself — registration remains via `Given/When/Then`.
