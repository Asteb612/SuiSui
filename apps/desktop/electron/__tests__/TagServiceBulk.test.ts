import { describe, it, expect, beforeEach, vi } from 'vitest'
import { vol } from 'memfs'
import { TagService } from '../services/TagService'
import type { IWorkspaceLocator } from '../services/SearchIndexService'
import { FakeFileWatcher } from './fakes/FakeFileWatcher'

vi.mock('node:fs/promises', async () => {
  const memfs = await import('memfs')
  return { default: memfs.vol.promises }
})

const WORKSPACE = '/ws'

const locator: IWorkspaceLocator = {
  getPath: () => WORKSPACE,
  getFeaturesDir: async () => 'features',
}

const LOGIN = `@auth
Feature: User login

  @smoke
  Scenario: Successful login
    Given a step

  Scenario: Failed login
    Given a step

  Scenario: Locked out
    Given a step
`

const CHECKOUT = `Feature: Checkout

  Scenario: Pay by card
    Given a step

  @smoke-test
  Scenario: Pay by transfer
    Given a step
`

async function build(files: Record<string, string>) {
  vol.reset()
  vol.fromJSON(files, WORKSPACE)
  const service = new TagService(new FakeFileWatcher(), locator)
  await service.rebuild()
  return service
}

function read(relativePath: string): string {
  return vol.readFileSync(`${WORKSPACE}/features/${relativePath}`, 'utf-8') as string
}

describe('TagService.applyBulk — add', () => {
  beforeEach(() => vol.reset())

  it('adds a tag to exactly the selected scenarios', async () => {
    const service = await build({ 'features/login.feature': LOGIN })
    const result = await service.applyBulk({
      operation: 'add',
      tag: 'critical',
      targets: [
        { relativePath: 'login.feature', scenarioIndex: 1 },
        { relativePath: 'login.feature', scenarioIndex: 2 },
      ],
    })

    expect(result.changedCount).toBe(2)
    expect(result.filesChanged).toBe(1)
    expect(result.failedCount).toBe(0)

    const content = read('login.feature')
    expect(content).toContain('@critical\n  Scenario: Failed login')
    expect(content).toContain('@critical\n  Scenario: Locked out')
    // The untargeted scenario is untouched.
    expect(content).toContain('@smoke\n  Scenario: Successful login')
    expect(content).not.toContain('@smoke @critical')
  })

  it('applies MULTIPLE targets in one file correctly (bottom-up ordering)', async () => {
    // Inserting a tag line above scenario 1 shifts scenario 2's recorded line.
    // Applying top-down would tag the wrong scenario — this is the regression.
    const service = await build({ 'features/login.feature': LOGIN })
    await service.applyBulk({
      operation: 'add',
      tag: 'x',
      targets: [
        { relativePath: 'login.feature', scenarioIndex: 0 },
        { relativePath: 'login.feature', scenarioIndex: 1 },
        { relativePath: 'login.feature', scenarioIndex: 2 },
      ],
    })

    const content = read('login.feature')
    expect(content).toContain('@smoke @x\n  Scenario: Successful login')
    expect(content).toContain('@x\n  Scenario: Failed login')
    expect(content).toContain('@x\n  Scenario: Locked out')
  })

  it('spans multiple files in one operation', async () => {
    const service = await build({
      'features/login.feature': LOGIN,
      'features/checkout.feature': CHECKOUT,
    })
    const result = await service.applyBulk({
      operation: 'add',
      tag: 'regression',
      targets: [
        { relativePath: 'login.feature', scenarioIndex: 0 },
        { relativePath: 'checkout.feature', scenarioIndex: 0 },
      ],
    })

    expect(result.filesChanged).toBe(2)
    expect(read('login.feature')).toContain('@regression')
    expect(read('checkout.feature')).toContain('@regression')
  })

  it('reports unchanged and does not rewrite when the tag is already there', async () => {
    const service = await build({ 'features/login.feature': LOGIN })
    const before = read('login.feature')

    const result = await service.applyBulk({
      operation: 'add',
      tag: 'smoke',
      targets: [{ relativePath: 'login.feature', scenarioIndex: 0 }],
    })

    expect(result.outcomes[0]!.status).toBe('unchanged')
    expect(result.filesChanged).toBe(0)
    expect(read('login.feature')).toBe(before)
  })

  it('accepts a tag written with a leading @', async () => {
    const service = await build({ 'features/login.feature': LOGIN })
    const result = await service.applyBulk({
      operation: 'add',
      tag: '@wip',
      targets: [{ relativePath: 'login.feature', scenarioIndex: 1 }],
    })
    expect(result.tag).toBe('wip')
    expect(read('login.feature')).toContain('@wip')
  })

  it('refuses an invalid tag name before writing anything', async () => {
    const service = await build({ 'features/login.feature': LOGIN })
    const before = read('login.feature')

    await expect(
      service.applyBulk({
        operation: 'add',
        tag: 'two words',
        targets: [{ relativePath: 'login.feature', scenarioIndex: 0 }],
      })
    ).rejects.toThrow(/Invalid tag name/)

    expect(read('login.feature')).toBe(before)
  })
})

describe('TagService.applyBulk — remove', () => {
  beforeEach(() => vol.reset())

  it('removes a directly-carried tag', async () => {
    const service = await build({ 'features/login.feature': LOGIN })
    const result = await service.applyBulk({
      operation: 'remove',
      tag: 'smoke',
      targets: [{ relativePath: 'login.feature', scenarioIndex: 0 }],
    })

    expect(result.changedCount).toBe(1)
    expect(read('login.feature')).not.toContain('@smoke')
  })

  it('refuses to remove an INHERITED tag, explaining why', async () => {
    const service = await build({ 'features/login.feature': LOGIN })
    const before = read('login.feature')

    const result = await service.applyBulk({
      operation: 'remove',
      tag: 'auth',
      targets: [{ relativePath: 'login.feature', scenarioIndex: 0 }],
    })

    expect(result.outcomes[0]!.status).toBe('skipped')
    expect(result.outcomes[0]!.reason).toMatch(/declared on the feature/i)
    expect(read('login.feature')).toBe(before)
  })

  it('reports unchanged when the scenario never had the tag', async () => {
    const service = await build({ 'features/login.feature': LOGIN })
    const result = await service.applyBulk({
      operation: 'remove',
      tag: 'nonexistent',
      targets: [{ relativePath: 'login.feature', scenarioIndex: 1 }],
    })
    expect(result.outcomes[0]!.status).toBe('unchanged')
  })

  it('does not damage a tag that has the removed one as a prefix', async () => {
    const service = await build({ 'features/checkout.feature': CHECKOUT })
    await service.applyBulk({
      operation: 'remove',
      tag: 'smoke',
      targets: [{ relativePath: 'checkout.feature', scenarioIndex: 1 }],
    })
    expect(read('checkout.feature')).toContain('@smoke-test')
  })
})

describe('TagService.applyBulk — preservation and verification', () => {
  beforeEach(() => vol.reset())

  it('changes ONLY tag lines — every other line is byte-identical', async () => {
    const source = [
      '# a leading comment',
      '@auth',
      'Feature: User login',
      '',
      '  Background:',
      '    Given I am on the "/login" page',
      '',
      '  @smoke',
      '  Scenario: Successful login',
      '    When I fill "user" with "admin"   ',
      '    Then I should see "Welcome"',
      '',
      '  Scenario: Failed login',
      '    Given a step',
      '',
    ].join('\n')

    const service = await build({ 'features/login.feature': source })
    await service.applyBulk({
      operation: 'add',
      tag: 'critical',
      targets: [{ relativePath: 'login.feature', scenarioIndex: 0 }],
    })

    const after = read('login.feature').split('\n')
    const before = source.split('\n')

    // One line changed (the tag line); everything else identical, in order.
    expect(after[7]).toBe('  @smoke @critical')
    before.forEach((line, i) => {
      if (i === 7) return
      expect(after[i], `line ${i}`).toBe(line)
    })
    expect(after).toHaveLength(before.length)
  })

  it('preserves CRLF line endings', async () => {
    const crlf = '@auth\r\nFeature: F\r\n\r\n  Scenario: S\r\n    Given a step\r\n'
    const service = await build({ 'features/crlf.feature': crlf })

    await service.applyBulk({
      operation: 'add',
      tag: 'win',
      targets: [{ relativePath: 'crlf.feature', scenarioIndex: 0 }],
    })

    const after = read('crlf.feature')
    expect(after).toContain('  @win\r\n  Scenario: S\r\n')
    // No line was silently converted to LF.
    expect(after.split('\n').filter((l) => l.length > 0 && !l.endsWith('\r'))).toHaveLength(0)
  })

  it('leaves every written file re-parseable (SC-009)', async () => {
    const service = await build({
      'features/login.feature': LOGIN,
      'features/checkout.feature': CHECKOUT,
    })

    const result = await service.applyBulk({
      operation: 'add',
      tag: 'verified',
      targets: [
        { relativePath: 'login.feature', scenarioIndex: 0 },
        { relativePath: 'login.feature', scenarioIndex: 2 },
        { relativePath: 'checkout.feature', scenarioIndex: 1 },
      ],
    })

    expect(result.failedCount).toBe(0)
    // The index is rebuilt from disk, so a broken file would surface here.
    expect(result.index.unparsedFiles).toEqual([])
    expect(result.index.tags.find((t) => t.name === 'verified')?.scenarioCount).toBe(3)
  })

  it('returns an index that already reflects the change (FR-026)', async () => {
    const service = await build({ 'features/login.feature': LOGIN })
    const result = await service.applyBulk({
      operation: 'add',
      tag: 'fresh',
      targets: [{ relativePath: 'login.feature', scenarioIndex: 1 }],
    })

    expect(result.index.tags.find((t) => t.name === 'fresh')?.scenarioCount).toBe(1)
    expect(service.getIndex().tags.find((t) => t.name === 'fresh')).toBeDefined()
  })
})

describe('TagService.applyBulk — partial failure', () => {
  beforeEach(() => vol.reset())

  it('reports a failed file while other files still apply', async () => {
    const service = await build({
      'features/login.feature': LOGIN,
      'features/checkout.feature': CHECKOUT,
    })

    // Make one file unwritable by removing it from under the service.
    vol.unlinkSync(`${WORKSPACE}/features/checkout.feature`)

    const result = await service.applyBulk({
      operation: 'add',
      tag: 'partial',
      targets: [
        { relativePath: 'login.feature', scenarioIndex: 0 },
        { relativePath: 'checkout.feature', scenarioIndex: 0 },
      ],
    })

    const login = result.outcomes.find((o) => o.relativePath === 'login.feature')!
    const checkout = result.outcomes.find((o) => o.relativePath === 'checkout.feature')!

    expect(login.status).toBe('changed')
    expect(checkout.status).toBe('failed')
    expect(checkout.reason).toBeTruthy()
    // No rollback: the successful file keeps its change.
    expect(read('login.feature')).toContain('@partial')
  })

  it('reports a target whose scenario no longer exists', async () => {
    const service = await build({ 'features/login.feature': LOGIN })
    const result = await service.applyBulk({
      operation: 'add',
      tag: 'ghost',
      targets: [{ relativePath: 'login.feature', scenarioIndex: 99 }],
    })

    expect(result.outcomes[0]!.status).toBe('failed')
    expect(result.failedCount).toBe(1)
  })

  it('reports a target in a file that is not part of the workspace', async () => {
    const service = await build({ 'features/login.feature': LOGIN })
    const result = await service.applyBulk({
      operation: 'add',
      tag: 'ghost',
      targets: [{ relativePath: 'elsewhere.feature', scenarioIndex: 0 }],
    })

    expect(result.outcomes[0]!.status).toBe('failed')
    expect(result.outcomes[0]!.reason).toMatch(/no longer part of the workspace/i)
  })
})
