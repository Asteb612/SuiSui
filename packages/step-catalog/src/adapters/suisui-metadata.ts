/**
 * SuiSui explicit-metadata reader (feature 006-step-catalog, US4).
 *
 * Statically reads a `defineStep({...})` object literal from the AST (no code
 * execution) into `RawDefineStepMeta`: title, description, category, tags, and
 * per-parameter labels/descriptions/examples. This is the most authoritative
 * metadata source in the merge precedence.
 */
import * as ts from 'typescript'
import type { RawDefineStepMeta } from '../internal-types'

function readString(expr: ts.Expression): string | undefined {
  return ts.isStringLiteralLike(expr) ? expr.text : undefined
}

function readStringArray(expr: ts.Expression): string[] {
  if (!ts.isArrayLiteralExpression(expr)) return []
  return expr.elements
    .map((el) => (ts.isStringLiteralLike(el) ? el.text : undefined))
    .filter((v): v is string => v !== undefined)
}

function propName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text
  return undefined
}

function readParameters(
  expr: ts.Expression,
): RawDefineStepMeta['parameters'] | undefined {
  if (!ts.isObjectLiteralExpression(expr)) return undefined
  const params: NonNullable<RawDefineStepMeta['parameters']> = {}
  for (const prop of expr.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const key = propName(prop.name)
    if (!key || !ts.isObjectLiteralExpression(prop.initializer)) continue
    const meta: { label?: string; description?: string; example?: string; defaultValue?: string } = {}
    for (const inner of prop.initializer.properties) {
      if (!ts.isPropertyAssignment(inner) || !ts.isIdentifier(inner.name)) continue
      const value = readString(inner.initializer)
      if (value === undefined) continue
      if (inner.name.text === 'label') meta.label = value
      else if (inner.name.text === 'description') meta.description = value
      else if (inner.name.text === 'example') meta.example = value
      else if (inner.name.text === 'defaultValue') meta.defaultValue = value
    }
    params[key] = meta
  }
  return params
}

/** Read a `defineStep({...})` object literal into RawDefineStepMeta. */
export function readDefineStepMeta(obj: ts.ObjectLiteralExpression): RawDefineStepMeta {
  const meta: RawDefineStepMeta = {}
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue
    const key = prop.name.text
    const value = prop.initializer
    if (key === 'title') meta.title = readString(value)
    else if (key === 'description') meta.description = readString(value)
    else if (key === 'category') meta.category = readString(value)
    else if (key === 'tags') meta.tags = readStringArray(value)
    else if (key === 'parameters') meta.parameters = readParameters(value)
  }
  return meta
}
