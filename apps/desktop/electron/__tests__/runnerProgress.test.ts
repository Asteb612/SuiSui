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

  it('reports a plain Playwright spec under its own source file, with no steps', async () => {
    // A config can run legacy `*.spec.ts` projects alongside the bdd one. Those
    // tests have no feature file, so `relativePath` is empty and `specPath`
    // locates them instead — reporting the spec as a feature named a file the
    // user has none for, and made the main process throw reading it. Step events
    // are dropped: there is no authored Gherkin list to show them against.
    const { createRequire } = await import('node:module')
    const requireCjs = createRequire(import.meta.url)
    const Reporter = requireCjs(assetPath)
    const reporter = new Reporter()

    const written: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk))
      return true
    })

    const legacy = {
      id: 't2',
      title: 'signs in',
      location: { file: '/w/playwright/tests/architect/account.spec.ts' },
    }
    const step = { category: 'test.step', title: 'inner step', duration: 3 }

    reporter.onBegin({ rootDir: '/w' }, { allTests: () => [] })
    reporter.onTestBegin(legacy, { retry: 0 })
    reporter.onStepBegin(legacy, {}, step)
    reporter.onStepEnd(legacy, {}, step)
    reporter.onTestEnd(legacy, { status: 'failed', duration: 40 })

    spy.mockRestore()

    const events = written
      .join('')
      .split('\n')
      .map((line) => parseProgressLine(line))
      .filter((event): event is NonNullable<typeof event> => event !== null)

    expect(events.map((e) => e.type)).toEqual(['runStart', 'testStart', 'testEnd'])
    expect(events[1]).toMatchObject({
      type: 'testStart',
      relativePath: '',
      specPath: 'playwright/tests/architect/account.spec.ts',
      title: 'signs in',
    })
  })

  it('locates a Gherkin test by its feature, not by the generated spec', async () => {
    // The source file of a Gherkin test is the GENERATED spec, which is not
    // somewhere to send anyone — the .feature path is the locator.
    const { createRequire } = await import('node:module')
    const requireCjs = createRequire(import.meta.url)
    const Reporter = requireCjs(assetPath)
    const reporter = new Reporter()

    const written: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk))
      return true
    })

    reporter.onBegin({ rootDir: '/w' }, { allTests: () => [] })
    reporter.onTestBegin(
      {
        id: 't3',
        title: 'Valid login',
        location: { file: '/w/.features-gen/features/login.feature.spec.js' },
      },
      { retry: 0 },
    )

    spy.mockRestore()

    const testStart = written
      .join('')
      .split('\n')
      .map((line) => parseProgressLine(line))
      .find((event) => event?.type === 'testStart')

    expect(testStart).toMatchObject({ relativePath: 'features/login.feature' })
    expect(testStart).not.toHaveProperty('specPath')
  })

  it('omits the source path rather than reporting one outside the project root', async () => {
    // A half-relative path is worse than none: it would send the reader nowhere.
    const { createRequire } = await import('node:module')
    const requireCjs = createRequire(import.meta.url)
    const Reporter = requireCjs(assetPath)
    const reporter = new Reporter()

    const written: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk))
      return true
    })

    reporter.onBegin({ rootDir: '/w' }, { allTests: () => [] })
    reporter.onTestBegin(
      { id: 't4', title: 'signs in', location: { file: '/elsewhere/account.spec.ts' } },
      { retry: 0 },
    )

    spy.mockRestore()

    const testStart = written
      .join('')
      .split('\n')
      .map((line) => parseProgressLine(line))
      .find((event) => event?.type === 'testStart')

    expect(testStart).toMatchObject({ relativePath: '' })
    expect(testStart).not.toHaveProperty('specPath')
  })

  it('keeps step events flowing for Gherkin tests interleaved with plain specs', async () => {
    const { createRequire } = await import('node:module')
    const requireCjs = createRequire(import.meta.url)
    const Reporter = requireCjs(assetPath)
    const reporter = new Reporter()

    const written: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk))
      return true
    })

    const legacy = { id: 't2', title: 'signs in', location: { file: '/w/tests/account.spec.ts' } }
    const bdd = {
      id: 't3',
      title: 'Valid login',
      location: { file: '/w/.features-gen/features/login.feature.spec.js' },
    }
    const step = { category: 'test.step', title: 'Given a step', duration: 3 }

    reporter.onBegin({ rootDir: '/w' }, { allTests: () => [] })
    reporter.onTestBegin(legacy, { retry: 0 })
    reporter.onTestBegin(bdd, { retry: 0 })
    reporter.onStepBegin(bdd, {}, step)
    reporter.onStepEnd(bdd, {}, step)
    reporter.onTestEnd(bdd, { status: 'passed', duration: 40 })
    reporter.onTestEnd(legacy, { status: 'failed', duration: 40 })

    spy.mockRestore()

    const events = written
      .join('')
      .split('\n')
      .map((line) => parseProgressLine(line))
      .filter((event): event is NonNullable<typeof event> => event !== null)

    const steps = events.filter((e) => e.type === 'stepStart' || e.type === 'stepEnd')
    expect(steps).toHaveLength(2)
    expect(steps.every((e) => 'testId' in e && e.testId === 't3')).toBe(true)
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

describe('a broken reporter never breaks the run (FR-019, SC-009)', () => {
  it('parses nothing from a corrupted reporter’s output, without throwing', () => {
    // Simulates the reporter file being corrupted after provisioning: whatever
    // reaches stdout is not valid sentinel NDJSON.
    const garbage = [
      'SyntaxError: Unexpected token }',
      '@@SUISUI_PROGRESS@@{"type":"stepStart",',
      '@@SUISUI_PROGRESS@@not json at all',
      '@@SUISUI_PROGRESS@@{"type":"nonsense"}',
      '',
    ]

    for (const line of garbage) {
      expect(() => parseProgressLine(line)).not.toThrow()
      expect(parseProgressLine(line)).toBeNull()
    }
  })

  it('leaves ordinary log lines untouched when they merely mention the sentinel', () => {
    // Only a line STARTING with the sentinel is an event; otherwise test output
    // could forge progress, and real log lines would vanish from the panel.
    expect(parseProgressLine(`a test printed ${PROGRESS_SENTINEL}{"type":"runEnd"}`)).toBeNull()
  })

  it('still runs when the reporter cannot be provisioned at all', () => {
    vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('EACCES')
    })

    // Null means "omit it from --reporter"; the run proceeds unchanged.
    expect(provisionProgressReporter(workspace)).toBeNull()
  })
})
