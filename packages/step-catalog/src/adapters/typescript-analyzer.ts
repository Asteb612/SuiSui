/**
 * TypeScript static analyzer (feature 006-step-catalog, US1).
 *
 * Parses a single step-definition source with the TypeScript Compiler API
 * (syntactic AST only — no type resolution, no code execution) and extracts one
 * `RawStepCandidate` per Given/When/Then registration. Cross-file constant
 * resolution and callback type precision are added in US2 (lazy Program).
 *
 * Supported today (US1):
 *  - plain-string / cucumber-expression / regexp / `step``` template patterns
 *  - locally aliased Given/When/Then (destructured from createBdd / bindSteps)
 *  - locally-declared constant patterns
 *  - defineStep({...}) pattern extraction (rich metadata read in US4)
 *  - source location, callback param names, destructured fixtures
 *  - dynamic / missing-callback / unresolved-keyword diagnostics
 */
import * as ts from 'typescript'
import type { CatalogStepKeyword } from '@suisui/shared'
import {
  cucumberArg,
  enumPattern,
  tableSuffix,
  optional,
  alternatives,
  type CucumberType,
} from '@suisui/step-regex'
import type { RawDefineStepMeta, RawFragmentMeta, RawPattern, RawStepCandidate } from '../internal-types'
import { readDefineStepMeta } from './suisui-metadata'
import { diagnostics } from '../diagnostics'
import { canonicalizePattern, canonicalizeRegex } from '../ids'
import type { CatalogDiagnostic, StepSourceLocation } from '@suisui/shared'

const KEYWORDS = new Set(['Given', 'When', 'Then'])
/** SuiSui interpolation helper name -> cucumber capture type. */
const HELPER_TO_TYPE: Record<string, CucumberType> = {
  str: 'string',
  int: 'int',
  float: 'float',
  word: 'word',
  any: 'any',
}

function scriptKindFor(fileName: string): ts.ScriptKind {
  if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (fileName.endsWith('.jsx')) return ts.ScriptKind.JSX
  if (/\.[cm]?js$/.test(fileName)) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function locationOf(sf: ts.SourceFile, node: ts.Node, file: string): StepSourceLocation {
  const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
  return { file, line: line + 1, column: character + 1 }
}

/** Unwrap `as const`, parentheses, and satisfies expressions. */
function unwrap(expr: ts.Expression): ts.Expression {
  let node: ts.Expression = expr
  while (
    ts.isAsExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    node = node.expression
  }
  return node
}

/** Extract string literal values from an array literal (with `as const`). */
function extractStringArray(expr: ts.Expression | undefined): string[] {
  if (!expr) return []
  const inner = unwrap(expr)
  if (!ts.isArrayLiteralExpression(inner)) return []
  return inner.elements
    .map((el) => (ts.isStringLiteralLike(el) ? el.text : undefined))
    .filter((v): v is string => v !== undefined)
}

function stringArg(expr: ts.Expression | undefined): string | undefined {
  if (!expr) return undefined
  const inner = unwrap(expr)
  return ts.isStringLiteralLike(inner) ? inner.text : undefined
}

/** Turn a SuiSui `step``` interpolation call into pattern text + fragment meta. */
function fragmentFromCall(call: ts.CallExpression): { text: string; frag: RawFragmentMeta } | null {
  if (!ts.isIdentifier(call.expression)) return null
  const helper = call.expression.text
  const arg0 = call.arguments[0]

  const cucumberType = HELPER_TO_TYPE[helper]
  if (cucumberType) {
    const name = stringArg(arg0)
    return {
      text: cucumberArg(cucumberType, name),
      frag: { kind: cucumberType, name, captures: true },
    }
  }
  if (helper === 'oneOf') {
    const values = extractStringArray(arg0)
    return {
      text: values.length >= 2 ? enumPattern(values) : `(${values.join('|')})`,
      frag: { kind: 'enum', enumValues: values, captures: true },
    }
  }
  if (helper === 'cols') {
    const columns = extractStringArray(arg0)
    return {
      text: columns.length >= 2 ? tableSuffix(columns) : `(${columns.join(', ')}):`,
      frag: { kind: 'table', tableColumns: columns, captures: true },
    }
  }
  if (helper === 'opt') {
    const text = stringArg(arg0) ?? ''
    return { text: optional(text), frag: { kind: 'optional', captures: false } }
  }
  if (helper === 'alt') {
    const words = extractStringArray(arg0)
    return { text: alternatives(words), frag: { kind: 'alternative', captures: false } }
  }
  return null
}

interface ResolvedPattern {
  pattern: RawPattern
  fragments?: RawFragmentMeta[]
  defineStepMeta?: RawDefineStepMeta
  diagnostics: CatalogDiagnostic[]
}

function hasCucumberParams(text: string): boolean {
  return /\{[^}]*\}|\([^)]*\|[^)]*\)|\([^)]+,[^)]+\)\s*:/.test(text)
}

/** Resolve a pattern expression (string/regex/template/identifier/defineStep). */
function resolvePattern(
  expr: ts.Expression,
  sf: ts.SourceFile,
  file: string,
  constInits: Map<string, ts.Expression>,
  depth = 0,
): ResolvedPattern {
  const node = unwrap(expr)
  const loc = locationOf(sf, expr, file)

  // String literal / no-substitution template -> plain-string or cucumber.
  if (ts.isStringLiteralLike(node)) {
    const source = node.text
    return {
      pattern: {
        kind: hasCucumberParams(source) ? 'cucumber' : 'plain-string',
        source,
        dynamic: false,
      },
      diagnostics: [],
    }
  }

  // Regular expression literal -> regexp with source + flags.
  if (ts.isRegularExpressionLiteral(node)) {
    const raw = node.text // e.g. /^foo$/i
    const match = raw.match(/^\/(.*)\/([gimsuy]*)$/s)
    const source = match ? match[1]! : raw
    const flags = match ? match[2]! : ''
    return { pattern: { kind: 'regexp', source, flags, dynamic: false }, diagnostics: [] }
  }

  // SuiSui `step``` tagged template.
  if (ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) && node.tag.text === 'step') {
    return resolveStepTemplate(node, sf, file)
  }

  // Untagged template literal.
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    const source = node.text
    return {
      pattern: {
        kind: hasCucumberParams(source) ? 'cucumber' : 'plain-string',
        source,
        dynamic: false,
      },
      diagnostics: [],
    }
  }
  if (ts.isTemplateExpression(node)) {
    // Depends on runtime values.
    const source = node.getText(sf)
    return {
      pattern: { kind: 'dynamic', source, dynamic: true },
      diagnostics: [diagnostics.dynamicPattern(source, loc)],
    }
  }

  // Identifier -> resolve a locally-declared constant.
  if (ts.isIdentifier(node)) {
    const init = constInits.get(node.text)
    if (init && depth < 8) {
      return resolvePattern(init, sf, file, constInits, depth + 1)
    }
    return {
      pattern: { kind: 'unknown', source: node.text, dynamic: false },
      diagnostics: [diagnostics.unresolvedIdentifier(node.text, loc)],
    }
  }

  // defineStep({ pattern, ... }) -> extract the pattern property + rich metadata.
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'defineStep') {
    const arg0 = node.arguments[0]
    if (arg0 && ts.isObjectLiteralExpression(arg0)) {
      const patternProp = arg0.properties.find(
        (p): p is ts.PropertyAssignment =>
          ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'pattern',
      )
      const defineStepMeta = readDefineStepMeta(arg0)
      if (patternProp) {
        const inner = resolvePattern(patternProp.initializer, sf, file, constInits, depth + 1)
        return { ...inner, defineStepMeta }
      }
    }
    return {
      pattern: { kind: 'unknown', source: node.getText(sf), dynamic: false },
      diagnostics: [diagnostics.invalidDefineStepMetadata('defineStep is missing a pattern.', loc)],
    }
  }

  return {
    pattern: { kind: 'unknown', source: node.getText(sf), dynamic: false },
    diagnostics: [diagnostics.unsupportedPatternExpression('Unsupported pattern expression.', loc)],
  }
}

function resolveStepTemplate(
  node: ts.TaggedTemplateExpression,
  sf: ts.SourceFile,
  file: string,
): ResolvedPattern {
  const diags: CatalogDiagnostic[] = []
  const fragments: RawFragmentMeta[] = []
  const parts: string[] = []
  const template = node.template

  if (ts.isNoSubstitutionTemplateLiteral(template)) {
    parts.push(template.text)
  } else {
    parts.push(template.head.text)
    for (const span of template.templateSpans) {
      const sub = unwrap(span.expression)
      if (ts.isCallExpression(sub)) {
        const frag = fragmentFromCall(sub)
        if (frag) {
          parts.push(frag.text)
          fragments.push(frag.frag)
        } else {
          diags.push(
            diagnostics.unsupportedPatternExpression(
              'Unsupported step``` interpolation.',
              locationOf(sf, span.expression, file),
            ),
          )
        }
      } else {
        diags.push(
          diagnostics.unsupportedPatternExpression(
            'Unsupported step``` interpolation.',
            locationOf(sf, span.expression, file),
          ),
        )
      }
      parts.push(span.literal.text)
    }
  }

  const source = canonicalizePattern(parts.join(''))
  return { pattern: { kind: 'suisui-template', source, dynamic: false }, fragments, diagnostics: diags }
}

/** Fixtures + callback param names/type annotations from a step callback. */
function extractCallback(
  arg: ts.Expression | undefined,
  sf: ts.SourceFile,
): {
  hasCallback: boolean
  fixtures: string[]
  callbackParamNames: string[]
  callbackParamTypes: (string | undefined)[]
} {
  if (!arg || (!ts.isArrowFunction(arg) && !ts.isFunctionExpression(arg))) {
    return { hasCallback: !!arg, fixtures: [], callbackParamNames: [], callbackParamTypes: [] }
  }
  const params = arg.parameters
  const fixtures: string[] = []
  if (params[0] && ts.isObjectBindingPattern(params[0].name)) {
    for (const el of params[0].name.elements) {
      const nameNode = el.propertyName ?? el.name
      if (ts.isIdentifier(nameNode)) fixtures.push(nameNode.text)
    }
  }
  const rest = params.slice(1)
  const callbackParamNames = rest
    .map((p) => (ts.isIdentifier(p.name) ? p.name.text : undefined))
    .filter((v): v is string => v !== undefined)
  // Explicit type annotations (syntactic — no TypeChecker needed) when present.
  const callbackParamTypes = rest.map((p) => (p.type ? p.type.getText(sf) : undefined))
  return { hasCallback: true, fixtures, callbackParamNames, callbackParamTypes }
}

/** Collect Given/When/Then local aliases and top-level const initializers. */
function collectBindings(sf: ts.SourceFile): {
  aliases: Map<string, CatalogStepKeyword>
  constInits: Map<string, ts.Expression>
} {
  const aliases = new Map<string, CatalogStepKeyword>()
  const constInits = new Map<string, ts.Expression>()

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      // Alias binding: const { Given, When: Action } = createBdd(...) / bindSteps(...)
      if (ts.isObjectBindingPattern(node.name) && isBddFactory(node.initializer)) {
        for (const el of node.name.elements) {
          const prop = el.propertyName ?? el.name
          const propText = ts.isIdentifier(prop) ? prop.text : undefined
          if (propText && KEYWORDS.has(propText) && ts.isIdentifier(el.name)) {
            aliases.set(el.name.text, propText as CatalogStepKeyword)
          }
        }
      }
      // Constant pattern: const foo = step`...` / '...' / /re/
      if (ts.isIdentifier(node.name)) {
        constInits.set(node.name.text, node.initializer)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { aliases, constInits }
}

function isBddFactory(expr: ts.Expression): boolean {
  const node = unwrap(expr)
  if (!ts.isCallExpression(node)) return false
  const callee = node.expression
  const name = ts.isIdentifier(callee) ? callee.text : undefined
  if (name === 'createBdd' || name === 'bindSteps') return true
  // bindSteps(createBdd(...)) already matches via name === 'bindSteps'.
  return false
}

/**
 * Analyze one source file into step candidates. Pure and filesystem-free.
 * `relPath` must already be workspace-relative POSIX.
 */
export function analyzeFile(relPath: string, source: string): RawStepCandidate[] {
  const sf = ts.createSourceFile(
    relPath,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    scriptKindFor(relPath),
  )
  const { aliases, constInits } = collectBindings(sf)
  const candidates: RawStepCandidate[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text
      const keyword = aliases.get(callee) ?? (KEYWORDS.has(callee) ? (callee as CatalogStepKeyword) : undefined)
      const isStepCall = keyword !== undefined && node.arguments.length >= 1
      if (isStepCall) {
        candidates.push(buildCandidate(node, keyword!, sf, relPath, constInits))
        return // do not descend into a matched step call
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return candidates
}

function buildCandidate(
  call: ts.CallExpression,
  keyword: CatalogStepKeyword,
  sf: ts.SourceFile,
  relPath: string,
  constInits: Map<string, ts.Expression>,
): RawStepCandidate {
  const patternExpr = call.arguments[0]!
  const resolved = resolvePattern(patternExpr, sf, relPath, constInits)
  const cb = extractCallback(call.arguments[1], sf)
  const location = locationOf(sf, call, relPath)
  const diags: CatalogDiagnostic[] = [...resolved.diagnostics]
  if (!cb.hasCallback) diags.push(diagnostics.missingCallback(location))

  const canonical =
    resolved.pattern.kind === 'regexp'
      ? canonicalizeRegex(resolved.pattern.source, resolved.pattern.flags ?? '')
      : canonicalizePattern(resolved.pattern.source)

  const candidate: RawStepCandidate = {
    keyword,
    pattern: resolved.pattern,
    location,
    callbackParamNames: cb.callbackParamNames,
    callbackParamTypes: cb.callbackParamTypes,
    fixtures: cb.fixtures,
    hasCallback: cb.hasCallback,
    diagnostics: diags,
    sourceForId: { relPath, canonicalPattern: canonical, line: location.line },
  }
  if (resolved.fragments) candidate.fragments = resolved.fragments
  if (resolved.defineStepMeta) candidate.defineStepMeta = resolved.defineStepMeta
  return candidate
}
