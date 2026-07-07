import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OpenAiCodexProvider } from '../services/ai/OpenAiCodexProvider'
import { ClaudeSubscriptionProvider } from '../services/ai/ClaudeSubscriptionProvider'
import type { AIStreamRequest } from '../services/ai/IAIProvider'

/**
 * SC-008 — CLI provider INTEGRATION tests.
 *
 * Unlike `ai-providers.test.ts` (which mocks `node:child_process` for fast unit tests),
 * this file drives the providers through their REAL subprocess spawn against fake-CLI
 * executable stubs (`fixtures/fake-cli/{codex,claude}`). It exercises the real
 * spawn → JSONL-stream parse → env-sanitization → kill-on-cancel path. The stubs are
 * Node scripts, NOT the real `codex`/`claude` binaries, so Constitution Principle III
 * (no real CLI in tests) still holds.
 *
 * Boundary note: the Claude provider's STREAMING path runs through the Agent SDK's
 * `query()` (which owns its own subprocess), so only its `status()` detection is
 * directly spawn-driven and thus stub-testable here.
 */

const FIXTURES = path.join(__dirname, 'fixtures', 'fake-cli')
const CODEX_STUB = path.join(FIXTURES, 'codex')
const CLAUDE_STUB = path.join(FIXTURES, 'claude')

const req = (input: string): AIStreamRequest => ({
  kind: 'scenario',
  input,
  context: { steps: [], scenarioText: null, targetStep: null },
})

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const c of stream) out += c
  return out
}

const waitFor = async (pred: () => boolean, timeoutMs = 2000): Promise<boolean> => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true
    await new Promise((r) => setTimeout(r, 20))
  }
  return pred()
}

// Sanity: the stubs must be present and executable, else the suite is meaningless.
describe('fake-CLI stubs are runnable', () => {
  it('codex stub emits JSONL', () => {
    const r = spawnSync(CODEX_STUB, ['exec', '--json', 'ping'], { encoding: 'utf8' })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('agent_message')
  })
  it('claude stub responds to --version', () => {
    const r = spawnSync(CLAUDE_STUB, ['--version'], { encoding: 'utf8' })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('claude')
  })
})

describe('OpenAiCodexProvider — integration via fake-CLI stub (SC-008)', () => {
  let tmp: string
  const savedEnv: Record<string, string | undefined> = {}

  afterEach(() => {
    for (const k of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'FAKE_CLI_ENV_OUT', 'FAKE_CLI_KILLED_OUT']) {
      if (savedEnv[k] === undefined) delete process.env[k]
      else process.env[k] = savedEnv[k]
    }
    if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true })
  })

  it('(a) assembles streamed text from the stub JSONL and (b) sanitizes the effective env', async () => {
    tmp = mkdtempSync(path.join(tmpdir(), 'sc008-codex-'))
    const envOut = path.join(tmp, 'env.json')
    // Plant billing keys that MUST be stripped from the spawned process.
    savedEnv.OPENAI_API_KEY = process.env.OPENAI_API_KEY
    savedEnv.CODEX_API_KEY = process.env.CODEX_API_KEY
    savedEnv.FAKE_CLI_ENV_OUT = process.env.FAKE_CLI_ENV_OUT
    process.env.OPENAI_API_KEY = 'sk-should-not-leak'
    process.env.CODEX_API_KEY = 'force-api-billing'
    process.env.FAKE_CLI_ENV_OUT = envOut

    const provider = new OpenAiCodexProvider({ model: null, command: CODEX_STUB })
    const out = await collect(provider.stream(req('draft a login scenario')))

    // (a) real JSONL parse assembled the agent_message text (decoy reasoning item ignored).
    expect(out).toBe('Feature: Login\n  Scenario: valid login')

    // (b) the SANITIZED env actually reached the spawned process — billing keys absent.
    const observed = JSON.parse(readFileSync(envOut, 'utf8')) as {
      OPENAI_API_KEY: string | null
      CODEX_API_KEY: string | null
    }
    expect(observed.OPENAI_API_KEY).toBeNull()
    expect(observed.CODEX_API_KEY).toBeNull()
  })

  it('(c) cancel cleanly kills the child process', async () => {
    tmp = mkdtempSync(path.join(tmpdir(), 'sc008-cancel-'))
    const killedOut = path.join(tmp, 'killed')
    savedEnv.FAKE_CLI_KILLED_OUT = process.env.FAKE_CLI_KILLED_OUT
    process.env.FAKE_CLI_KILLED_OUT = killedOut

    const controller = new AbortController()
    const provider = new OpenAiCodexProvider({ model: null, command: CODEX_STUB })
    // "__HANG__" makes the stub stay alive until it receives SIGTERM.
    const p = collect(provider.stream({ ...req('__HANG__'), signal: controller.signal }))
    // Let the child spawn, then cancel.
    await new Promise((r) => setTimeout(r, 100))
    controller.abort()

    await expect(p).rejects.toThrow('Aborted')
    expect(await waitFor(() => existsSync(killedOut))).toBe(true)
    expect(readFileSync(killedOut, 'utf8')).toBe('killed')
  })

  it('surfaces a non-zero CLI exit as a clear error (FR-015)', async () => {
    const provider = new OpenAiCodexProvider({ model: null, command: CODEX_STUB })
    await expect(collect(provider.stream(req('__EXIT1__')))).rejects.toThrow('not logged in')
  })
})

describe('ClaudeSubscriptionProvider — status() integration via fake-CLI stub (SC-008)', () => {
  it('reports available when the (stub) CLI runs and exits 0', async () => {
    const provider = new ClaudeSubscriptionProvider({ model: null, command: CLAUDE_STUB })
    const status = await provider.status()
    expect(status.available).toBe(true)
    expect(status.detail).toBe('running')
  })

  it('reports not-installed when the CLI binary is missing (ENOENT)', async () => {
    const provider = new ClaudeSubscriptionProvider({
      model: null,
      command: path.join(FIXTURES, 'does-not-exist-binary'),
    })
    const status = await provider.status()
    expect(status.available).toBe(false)
    expect(status.detail).toBe('not-installed')
  })
})
