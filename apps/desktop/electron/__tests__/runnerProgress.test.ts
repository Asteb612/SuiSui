import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PROGRESS_SENTINEL, parseProgressLine } from '@suisui/shared'
import { provisionProgressReporter } from '../services/RunnerService'

let workspace: string

beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'suisui-progress-'))
})

afterEach(() => {
  fs.rmSync(workspace, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('provisionProgressReporter', () => {
  it('writes the reporter into the workspace .app directory and returns its path', () => {
    const result = provisionProgressReporter(workspace)

    expect(result).toBe(path.join(workspace, '.app', 'suisui-progress-reporter.cjs'))
    expect(fs.existsSync(result!)).toBe(true)
    expect(fs.readFileSync(result!, 'utf-8')).toContain(PROGRESS_SENTINEL)
  })

  it('overwrites an existing reporter so an upgrade cannot leave a stale one', () => {
    const target = path.join(workspace, '.app', 'suisui-progress-reporter.cjs')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, '// stale content from an older version')

    provisionProgressReporter(workspace)
    expect(fs.readFileSync(target, 'utf-8')).not.toContain('stale content')
  })

  it('returns null instead of throwing when the reporter cannot be written', () => {
    // A progress indicator must never be able to stop someone running tests.
    vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('EACCES')
    })

    expect(() => provisionProgressReporter(workspace)).not.toThrow()
    expect(provisionProgressReporter(workspace)).toBeNull()
  })
})

describe('the shipped reporter asset', () => {
  const assetPath = path.join(__dirname, '..', 'assets', 'suisui-progress-reporter.cjs')

  it('is loadable as CommonJS and exports a reporter class', async () => {
    const { createRequire } = await import('node:module')
    const requireCjs = createRequire(import.meta.url)
    const Reporter = requireCjs(assetPath)

    expect(typeof Reporter).toBe('function')
    const reporter = new Reporter()
    for (const hook of ['onBegin', 'onTestBegin', 'onStepBegin', 'onStepEnd', 'onTestEnd', 'onEnd']) {
      expect(typeof reporter[hook], hook).toBe('function')
    }
  })

  it('emits parseable events and never throws, even on malformed input', async () => {
    const { createRequire } = await import('node:module')
    const requireCjs = createRequire(import.meta.url)
    const Reporter = requireCjs(assetPath)
    const reporter = new Reporter()

    const written: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk))
      return true
    })

    const test = { id: 't1', title: 'Valid login', location: { file: '/w/.features-gen/features/login.feature.spec.js' } }
    const step = { category: 'test.step', title: 'Given a step', duration: 12 }

    reporter.onBegin({}, { allTests: () => [1, 2, 3] })
    reporter.onTestBegin(test, { retry: 0 })
    reporter.onStepBegin(test, {}, step)
    reporter.onStepEnd(test, {}, step)
    reporter.onTestEnd(test, { status: 'passed', duration: 40 })
    reporter.onEnd({})

    spy.mockRestore()

    const events = written
      .join('')
      .split('\n')
      .map((line) => parseProgressLine(line))
      .filter((event): event is NonNullable<typeof event> => event !== null)

    expect(events.map((e) => e.type)).toEqual([
      'runStart',
      'testStart',
      'stepStart',
      'stepEnd',
      'testEnd',
      'runEnd',
    ])

    const testStart = events.find((e) => e.type === 'testStart')
    // The generated spec path is mapped back to the .feature file.
    expect(testStart).toMatchObject({ relativePath: 'features/login.feature', title: 'Valid login' })
  })

  it('never throws on missing or malformed arguments', async () => {
    // The reporter runs inside the user's test process. An exception escaping a
    // callback could fail their run, so every hook swallows its own errors.
    const { createRequire } = await import('node:module')
    const requireCjs = createRequire(import.meta.url)
    const Reporter = requireCjs(assetPath)
    const reporter = new Reporter()

    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    expect(() => reporter.onBegin(undefined, undefined)).not.toThrow()
    expect(() => reporter.onTestBegin(undefined, undefined)).not.toThrow()
    expect(() => reporter.onStepBegin(undefined, undefined, undefined)).not.toThrow()
    expect(() => reporter.onStepEnd(undefined, undefined, undefined)).not.toThrow()
    expect(() => reporter.onTestEnd(undefined, undefined)).not.toThrow()
    expect(() => reporter.onEnd(undefined)).not.toThrow()

    spy.mockRestore()
  })

  it('keeps working when stdout writes fail', async () => {
    const { createRequire } = await import('node:module')
    const requireCjs = createRequire(import.meta.url)
    const Reporter = requireCjs(assetPath)
    const reporter = new Reporter()

    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => {
      throw new Error('EPIPE')
    })

    const test = { id: 't1', title: 'X', location: { file: 'a.feature.spec.js' } }
    expect(() => reporter.onTestBegin(test, { retry: 0 })).not.toThrow()
    expect(() => reporter.onEnd({})).not.toThrow()

    spy.mockRestore()
  })

  it('ignores steps that are not authored Gherkin steps', async () => {
    const { createRequire } = await import('node:module')
    const requireCjs = createRequire(import.meta.url)
    const Reporter = requireCjs(assetPath)
    const reporter = new Reporter()

    const written: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk))
      return true
    })

    const test = { id: 't1', title: 'X', location: { file: 'a.feature.spec.js' } }
    reporter.onTestBegin(test, { retry: 0 })
    // Hooks, fixtures and expect() calls are not Gherkin steps.
    reporter.onStepBegin(test, {}, { category: 'hook', title: 'Before Hooks' })
    reporter.onStepBegin(test, {}, { category: 'expect', title: 'expect.toBeVisible' })
    reporter.onStepBegin(test, {}, { category: 'test.step', title: 'Given a real step' })

    spy.mockRestore()

    const stepStarts = written
      .join('')
      .split('\n')
      .map((line) => parseProgressLine(line))
      .filter((event) => event?.type === 'stepStart')

    expect(stepStarts).toHaveLength(1)
    expect(stepStarts[0]).toMatchObject({ index: 0, title: 'Given a real step' })
  })

  it('numbers steps per test, restarting on a retry', async () => {
    const { createRequire } = await import('node:module')
    const requireCjs = createRequire(import.meta.url)
    const Reporter = requireCjs(assetPath)
    const reporter = new Reporter()

    const written: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk))
      return true
    })

    const test = { id: 't1', title: 'X', location: { file: 'a.feature.spec.js' } }
    reporter.onTestBegin(test, { retry: 0 })
    reporter.onStepBegin(test, {}, { category: 'test.step', title: 'one' })
    reporter.onStepBegin(test, {}, { category: 'test.step', title: 'two' })
    reporter.onTestEnd(test, { status: 'failed', duration: 1 })
    reporter.onTestBegin(test, { retry: 1 })
    reporter.onStepBegin(test, {}, { category: 'test.step', title: 'one' })

    spy.mockRestore()

    const indexes = written
      .join('')
      .split('\n')
      .map((line) => parseProgressLine(line))
      .filter((e) => e?.type === 'stepStart')
      .map((e) => (e as { index: number }).index)

    expect(indexes).toEqual([0, 1, 0])
  })
})
