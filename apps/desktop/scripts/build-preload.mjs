#!/usr/bin/env node
import { build, context } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Bundle the Electron preload script.
 *
 * The window is created with `sandbox: true` (see electron/main.ts). A sandboxed
 * preload's `require` is a webpack-style polyfill that can only resolve `electron`
 * and a handful of Node builtins — it CANNOT resolve a bare workspace specifier
 * like `@suisui/shared`, which is why the un-bundled tsc output fails at runtime
 * with "module not found: @suisui/shared".
 *
 * esbuild inlines `@suisui/shared` (IPC channel constants; the types erase) into a
 * single self-contained file, leaving only `electron` external. The output is named
 * `preload.bundle.js` so it never collides with tsc's `preload.js` (tsc still emits
 * + typechecks preload.ts; only this bundle is loaded at runtime).
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [path.join(root, 'electron', 'preload.ts')],
  outfile: path.join(root, 'dist-electron', 'preload.bundle.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
}

const watch = process.argv.includes('--watch')

if (watch) {
  const ctx = await context(options)
  await ctx.watch()
  console.log('[build-preload] watching electron/preload.ts -> dist-electron/preload.bundle.js')
} else {
  await build(options)
  console.log('[build-preload] bundled dist-electron/preload.bundle.js')
}
