# @suisui/step-regex

Type-safe, structured authoring of BDD step patterns — and the matching
`RegExp` — for [playwright-bdd](https://github.com/vitalets/playwright-bdd) /
Gherkin. Stop hand-writing cucumber-expression strings and brittle regexes:
describe a step in typed pieces and get the pattern, the regex, and statically
typed step arguments.

Zero runtime dependencies.

## Install

```bash
npm install @suisui/step-regex
```

## Headline: the `step` tagged template

`step\`...\``returns a plain (branded) string, so it drops straight into`Given/When/Then`. Wrap your BDD trio once with `bindSteps` to get the
callback arguments typed from the pattern.

```ts
import { createBdd } from 'playwright-bdd'
import { step, str, int, oneOf, opt, cols, bindSteps } from '@suisui/step-regex'

const { Given, When, Then } = bindSteps(createBdd())

Given(step`I log in as ${oneOf(['admin', 'user', 'guest'] as const)}`, async ({ page }, role) => {
  // role: 'admin' | 'user' | 'guest'
})

When(step`I fill ${str('field')} with ${str('value')}`, async ({ page }, field, value) => {
  // field: string, value: string
})

Then(step`I wait for ${int()} second${opt('s')}`, async ({ page }, seconds) => {
  // seconds: number (opt captures nothing)
})

When(step`I submit ${cols(['Field', 'Value'] as const)}`, async ({ page }, table) => {
  // table: DataTableArg<'Field' | 'Value'>
})
```

### Interpolation helpers

| Helper          | Fragment    | Captures                           |
| --------------- | ----------- | ---------------------------------- |
| `str(name?)`    | `{string}`  | `string`                           |
| `int(name?)`    | `{int}`     | `number`                           |
| `float(name?)`  | `{float}`   | `number`                           |
| `word(name?)`   | `{word}`    | `string`                           |
| `any(name?)`    | `{any}`     | `string`                           |
| `oneOf(values)` | `(a\|b\|c)` | union of `values` (use `as const`) |
| `cols(columns)` | `(C1, C2):` | `DataTableArg<columns>`            |
| `opt(text)`     | `(text)`    | — (nothing)                        |
| `alt(words)`    | `a/b`       | — (nothing)                        |

## Pattern → RegExp

```ts
import { step, int, opt, patternToRegex, stripAnchors } from '@suisui/step-regex'

patternToRegex(step`I wait for ${int()} second${opt('s')}`)
// /^I wait for (-?\d+) second(?:s)?$/
stripAnchors('^I am on the page$') // 'I am on the page'
```

## Low-level fragment builders

`cucumberArg`, `enumPattern`, `tableSuffix`, `optional`, `alternatives`,
`buildStepPattern` — the plain string functions the helpers wrap.

## Pattern type handlers

`cucumberHandler`, `enumHandler`, `tableHandler` (with the `PatternType`,
`ArgDescription`, `PatternSegment`, `FormattedPattern`, `StepArgDefinition`
types) for building your own pattern tooling.

## Scenario context

A tiny per-scenario state bag. Create one per scenario (e.g. a playwright-bdd
fixture) — never a module-global singleton (not parallel-worker safe).

```ts
import { createScenarioContext } from '@suisui/step-regex'

const ctx = createScenarioContext()
ctx.set('userId', 42)
ctx.require<number>('userId') // 42, throws if missing
```

## Releasing

Publishing is automated by the `step-regex-release` GitHub workflow:

1. Bump `version` in `packages/step-regex/package.json`.
2. Tag the commit `step-regex-vX.Y.Z` (must match the package version) and push
   the tag — or run the workflow manually with `dry-run`.

> The workflow requires a repository secret **`NPM_TOKEN`** (an npm automation
> token with publish rights to the `@suisui` scope). Until it is added the
> workflow is inert.

## License

MIT
