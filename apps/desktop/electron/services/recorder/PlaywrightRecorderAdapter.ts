import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'
import type { RecorderStartOptions, LocatorValidationResult, RecorderErrorCode } from '@suisui/shared'
import type { AdapterEventHandlers, AdapterStartInfo, IRecorderAdapter } from './IRecorderAdapter'
import type { RawRecordedAction, RawPickedElement, RawAssertEvent } from './types'
import { getNodeService } from '../NodeService'
import { getWorkspaceService } from '../WorkspaceService'
import { makeRecorderError } from './recorderErrors'
import { createLogger } from '../../utils/logger'

const logger = createLogger('PlaywrightRecorderAdapter')

/** Error thrown from `start()` that carries a recorder error code for the caller. */
class RecorderStartError extends Error {
  constructor(
    readonly code: RecorderErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'RecorderStartError'
  }
}

function startError(code: RecorderErrorCode, message?: string): RecorderStartError {
  const info = makeRecorderError(code, message ? { message } : {})
  const full = info.recovery ? `${info.message} ${info.recovery}` : info.message
  return new RecorderStartError(code, full)
}

/**
 * Real adapter: drives the workspace's Playwright via an embedded-Node child
 * (`scripts/recorder-adapter.js`) using the private
 * `_enableRecorder({ recorderMode: 'api' })` API (research D1/D2/D13). The child
 * is the ONLY code touching that private API; this parent just spawns it,
 * translates NDJSON stdout into `AdapterEventHandlers`, and writes NDJSON
 * commands to stdin. No Playwright/Chromium ever loads in the main process, and
 * tests never reach this class (they inject `FakeRecorderAdapter`, Principle III).
 */
export class PlaywrightRecorderAdapter implements IRecorderAdapter {
  private child: ChildProcess | null = null
  private handlers: AdapterEventHandlers | null = null
  private started = false
  private stopping = false
  private stdoutBuf = ''
  private validateSeq = 0
  private readonly pendingValidate = new Map<number, (r: LocatorValidationResult) => void>()

  async start(options: RecorderStartOptions, handlers: AdapterEventHandlers): Promise<AdapterStartInfo> {
    const workspacePath = getWorkspaceService().getPath()
    if (!workspacePath) throw startError('NO_WORKSPACE')

    const nodeExec = await getNodeService().getNodePath()
    if (!nodeExec) throw startError('ADAPTER_CRASHED', 'The Node.js runtime is unavailable. Restart the application.')

    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'recorder-adapter.js')
    if (!fs.existsSync(scriptPath)) {
      throw startError('ADAPTER_CRASHED', 'The recorder helper script is missing from the installation.')
    }

    const workspaceNodeModules = path.join(workspacePath, 'node_modules')
    const nodeDir = path.dirname(nodeExec)
    const pathParts = [nodeDir]
    const binDir = path.join(workspaceNodeModules, '.bin')
    if (fs.existsSync(binDir)) pathParts.push(binDir)
    if (process.env.PATH) pathParts.push(process.env.PATH)

    const testIdAttr = options.locatorSettings?.preferredTestIdAttributes?.[0] ?? 'data-testid'
    const args = [scriptPath, `--start-url=${options.startUrl ?? ''}`, `--test-id-attr=${testIdAttr}`]

    this.handlers = handlers
    this.started = false
    this.stopping = false
    this.stdoutBuf = ''

    const child = spawn(nodeExec, args, {
      cwd: workspacePath,
      env: { ...process.env, NODE_PATH: workspaceNodeModules, PATH: pathParts.join(path.delimiter) },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child = child

    return await new Promise<AdapterStartInfo>((resolve, reject) => {
      let settled = false
      const settleReject = (err: Error) => {
        if (settled) return
        settled = true
        reject(err)
      }
      const settleResolve = (info: AdapterStartInfo) => {
        if (settled) return
        settled = true
        this.started = true
        resolve(info)
      }

      child.on('error', (err) => {
        logger.error('Recorder child failed to spawn', err)
        settleReject(startError('ADAPTER_CRASHED', `The recorder process could not start: ${err.message}`))
      })

      child.stderr?.on('data', (d) => logger.debug('recorder-adapter stderr', { line: String(d).trim() }))

      child.stdout?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => {
        this.stdoutBuf += chunk
        let nl: number
        while ((nl = this.stdoutBuf.indexOf('\n')) >= 0) {
          const line = this.stdoutBuf.slice(0, nl).trim()
          this.stdoutBuf = this.stdoutBuf.slice(nl + 1)
          if (line) this.onLine(line, settleResolve, settleReject)
        }
      })

      child.on('exit', (code, signal) => {
        this.child = null
        for (const resolveFn of this.pendingValidate.values()) {
          resolveFn({ unique: false, matchedElements: 0, stillMatches: false })
        }
        this.pendingValidate.clear()
        if (!settled) {
          settleReject(
            startError('ADAPTER_CRASHED', `The recorder process exited before it was ready (code ${code ?? signal}).`)
          )
          return
        }
        if (!this.stopping && this.started) {
          this.handlers?.onError({ code: 'ADAPTER_CRASHED', fatal: true })
        }
      })
    })
  }

  private onLine(
    line: string,
    settleResolve: (info: AdapterStartInfo) => void,
    settleReject: (err: Error) => void
  ): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(line)
    } catch {
      logger.debug('recorder-adapter non-JSON line', { line })
      return
    }
    const h = this.handlers
    switch (msg.t) {
      case 'ready':
        settleResolve({
          playwrightVersion: String(msg.playwrightVersion ?? 'unknown'),
          browser: String(msg.browser ?? 'chromium'),
        })
        break
      case 'action':
        h?.onAction(this.toRawAction(msg))
        break
      case 'actionUpdated':
        h?.onActionUpdated(this.toRawAction(msg))
        break
      case 'picked':
        h?.onPicked(this.toRawPicked(msg, false))
        break
      case 'pickCancelled':
        h?.onPicked(this.toRawPicked(msg, true))
        break
      case 'assert':
        h?.onAssert?.(this.toRawAssert(msg))
        break
      case 'status':
        h?.onStatus({ phase: msg.phase as never, ...(msg.url !== undefined ? { url: String(msg.url) } : {}) })
        break
      case 'validate': {
        const rid = Number(msg.requestId)
        const resolveFn = this.pendingValidate.get(rid)
        if (resolveFn) {
          this.pendingValidate.delete(rid)
          resolveFn({
            unique: Boolean(msg.unique),
            matchedElements: Number(msg.matchedElements ?? 0),
            stillMatches: Boolean(msg.stillMatches),
          })
        }
        break
      }
      case 'error': {
        const code = (msg.code as RecorderErrorCode) ?? 'ADAPTER_CRASHED'
        const message = typeof msg.message === 'string' ? msg.message : undefined
        // A fatal error before `ready` means the session never started: surface
        // it as the start() rejection (the child then exits on its own).
        if (!this.started && msg.fatal) {
          settleReject(startError(code, message))
        } else {
          h?.onError({
            code,
            ...(message ? { message } : {}),
            ...(typeof msg.recovery === 'string' ? { recovery: msg.recovery } : {}),
            fatal: Boolean(msg.fatal),
          })
        }
        break
      }
      default:
        break
    }
  }

  private toRawAction(msg: Record<string, unknown>): RawRecordedAction {
    return {
      seq: Number(msg.seq ?? 0),
      pageGuid: String(msg.pageGuid ?? 'page'),
      action: msg.action as RawRecordedAction['action'],
      ...(msg.fingerprint ? { fingerprint: msg.fingerprint as RawRecordedAction['fingerprint'] } : {}),
      ...(Array.isArray(msg.candidates) ? { candidates: msg.candidates as RawRecordedAction['candidates'] } : {}),
      ...(msg.secret ? { secret: true } : {}),
    }
  }

  private toRawAssert(msg: Record<string, unknown>): RawAssertEvent {
    return {
      assertType: String(msg.assertType ?? 'assertVisible'),
      ...(typeof msg.value === 'string' ? { value: msg.value } : {}),
      ...(msg.fingerprint ? { fingerprint: msg.fingerprint as RawAssertEvent['fingerprint'] } : {}),
      ...(Array.isArray(msg.candidates) ? { candidates: msg.candidates as RawAssertEvent['candidates'] } : {}),
    }
  }

  private toRawPicked(msg: Record<string, unknown>, cancelled: boolean): RawPickedElement {
    return {
      pickId: String(msg.pickId ?? ''),
      pageGuid: String(msg.pageGuid ?? 'active'),
      fingerprint: (msg.fingerprint as RawPickedElement['fingerprint']) ?? { tagName: '' },
      candidates: (Array.isArray(msg.candidates) ? msg.candidates : []) as RawPickedElement['candidates'],
      cancelled: cancelled || Boolean(msg.cancelled),
    }
  }

  private send(cmd: Record<string, unknown>): void {
    const stdin = this.child?.stdin
    if (stdin && !stdin.destroyed) {
      try {
        stdin.write(JSON.stringify(cmd) + '\n')
      } catch (err) {
        logger.debug('recorder-adapter stdin write failed', { error: (err as Error).message })
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.child) return
    this.stopping = true
    const child = this.child
    this.send({ cmd: 'stop' })
    // Give the child a moment to close the browser, then force-kill.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (this.child) this.child.kill('SIGKILL')
        resolve()
      }, 4000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    this.child = null
    this.handlers = null
  }

  async pause(): Promise<void> {
    this.send({ cmd: 'pause' })
  }

  async resume(): Promise<void> {
    this.send({ cmd: 'resume' })
  }

  async pick(pickId: string): Promise<void> {
    this.send({ cmd: 'pick', pickId })
  }

  async cancelPick(): Promise<void> {
    this.send({ cmd: 'cancelPick' })
  }

  async highlight(selector: string): Promise<void> {
    this.send({ cmd: 'highlight', selector })
  }

  async validate(selector: string): Promise<LocatorValidationResult> {
    if (!this.child) return { unique: false, matchedElements: 0, stillMatches: false }
    const requestId = ++this.validateSeq
    return await new Promise<LocatorValidationResult>((resolve) => {
      this.pendingValidate.set(requestId, resolve)
      this.send({ cmd: 'validate', selector, requestId })
      setTimeout(() => {
        if (this.pendingValidate.delete(requestId)) {
          resolve({ unique: false, matchedElements: 0, stillMatches: false })
        }
      }, 4000)
    })
  }
}
