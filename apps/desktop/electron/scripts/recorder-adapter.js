/* eslint-disable */
'use strict'

/**
 * Recorder child adapter (T023/T033/T034/T042).
 *
 * The ONLY code that touches Playwright's private
 * `context._enableRecorder({ recorderMode: 'api' })`. Runs under the app's
 * embedded Node with the WORKSPACE's Playwright (NODE_PATH), streams NDJSON on
 * stdout, and takes NDJSON commands on stdin. It suppresses Playwright's in-page
 * overlay (`x-pw-glass`), hosts SuiSui's own one-shot element picker, enriches
 * each action with an ElementFingerprint + candidate uniqueness, and REDACTS
 * secrets at the source (a password value never leaves this process). See
 * specs/007-native-recorder/contracts/adapter-protocol.md + research D1/D2/D13.
 *
 * Plain CommonJS (no TS): validated by a manual harness, not CI (Constitution III).
 */

const SUPPORTED = { min: [1, 49], max: [1, 61] } // >=1.49 <1.61
const TESTID_ATTRS = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa', 'data-e2e']

function emit(obj) {
  try {
    process.stdout.write(JSON.stringify({ v: 1, ...obj }) + '\n')
  } catch (_) {}
}
function log(msg) {
  try {
    process.stderr.write('[recorder-adapter] ' + msg + '\n')
  } catch (_) {}
}
function fatal(code, message) {
  emit({ t: 'error', code, message, fatal: true })
}

// --- args -------------------------------------------------------------------
const args = process.argv.slice(2)
function argVal(name, dflt) {
  const p = args.find((a) => a.startsWith('--' + name + '='))
  return p ? p.slice(name.length + 3) : dflt
}
const START_URL = argVal('start-url', '')
const TEST_ID_ATTR = argVal('test-id-attr', 'data-testid')
const DEBUG = process.env.RECORDER_DEBUG === '1'

// --- in-page fingerprint helper (injected into every page) ------------------
const INJECT = `
window.__suisuiFp = function (el) {
  if (!el || el.nodeType !== 1) return null;
  var attrs = {};
  for (var i = 0; i < el.attributes.length; i++) attrs[el.attributes[i].name] = el.attributes[i].value;
  var tagName = el.tagName.toLowerCase();
  var testAttributes = {};
  for (var k in attrs) if (/^data-(testid|test-id|test|cy|qa|e2e|automation|component)$/.test(k)) testAttributes[k] = attrs[k];
  var role = attrs['role'] || null;
  if (!role) {
    if (tagName === 'button') role = 'button';
    else if (tagName === 'a' && el.hasAttribute('href')) role = 'link';
    else if (tagName === 'select') role = 'combobox';
    else if (tagName === 'textarea') role = 'textbox';
    else if (/^h[1-6]$/.test(tagName)) role = 'heading';
    else if (tagName === 'input') {
      var t = (attrs['type'] || 'text').toLowerCase();
      if (t === 'checkbox') role = 'checkbox';
      else if (t === 'radio') role = 'radio';
      else if (t === 'button' || t === 'submit' || t === 'reset') role = 'button';
      else if (t === 'search') role = 'searchbox';
      else if (['email','tel','url','text','number','password'].indexOf(t) >= 0) role = 'textbox';
    }
  }
  var label = null;
  try {
    if (el.id) { var lf = document.querySelector('label[for="' + (window.CSS ? CSS.escape(el.id) : el.id) + '"]'); if (lf) label = (lf.textContent || '').trim(); }
    if (!label) { var lp = el.closest ? el.closest('label') : null; if (lp) label = (lp.textContent || '').trim(); }
  } catch (e) {}
  var ariaLabel = attrs['aria-label'] || null;
  var text = ((el.textContent || '').trim()).slice(0, 120) || null;
  var placeholder = attrs['placeholder'] || null;
  var accessibleName = ariaLabel || label || ((role === 'button' || role === 'link' || role === 'heading') ? text : null) || attrs['title'] || null;
  var classSelector = null;
  if (el.classList && el.classList.length) {
    var parts = [];
    for (var c = 0; c < el.classList.length; c++) parts.push(window.CSS ? CSS.escape(el.classList[c]) : el.classList[c]);
    classSelector = tagName + '.' + parts.join('.');
  }
  return {
    tagName: tagName, role: role, accessibleName: accessibleName, label: label, placeholder: placeholder,
    testAttributes: testAttributes, id: el.id || null, name: attrs['name'] || null, ariaLabel: ariaLabel,
    text: text, inputType: tagName === 'input' ? (attrs['type'] || 'text') : null,
    autocomplete: attrs['autocomplete'] || null, classSelector: classSelector
  };
};
window.__suisuiCount = function (sel) { try { return document.querySelectorAll(sel).length } catch (e) { return -1 } };
// Snapshot the target at pointerdown — BEFORE any click handler can navigate —
// so submit buttons that redirect still keep a real, counted locator. Sent to
// the child via the exposed binding (in flight before navigation commits).
window.addEventListener('pointerdown', function (e) {
  try {
    var el = (e.composedPath && e.composedPath()[0]) || e.target;
    var fp = window.__suisuiFp(el);
    var counts = {};
    if (fp) {
      var q = function (s) { return String(s).replace(/"/g, '\\\\"'); };
      for (var k in fp.testAttributes) counts['testId:' + k] = window.__suisuiCount('[' + k + '="' + q(fp.testAttributes[k]) + '"]');
      if (fp.id) counts['id'] = window.__suisuiCount('[id="' + q(fp.id) + '"]');
      if (fp.name) counts['name'] = window.__suisuiCount('[name="' + q(fp.name) + '"]');
      if (fp.placeholder) counts['placeholder'] = window.__suisuiCount('[placeholder="' + q(fp.placeholder) + '"]');
      if (fp.classSelector) counts['css'] = window.__suisuiCount(fp.classSelector);
    }
    if (window.__suisuiCapture) window.__suisuiCapture({ fp: fp, counts: counts });
  } catch (err) {}
}, true);
`

// --- secret classification (mirrors electron/services/recorder/secretDetection) ---
const SENSITIVE_NAME = /pass(?:word|wd)?|token|secret|api[-_\s]?key|authorization/i
function isSensitive(fp) {
  if (!fp) return false
  if (fp.inputType === 'password') return true
  if (fp.autocomplete === 'current-password' || fp.autocomplete === 'new-password') return true
  return [fp.name, fp.id, fp.label, fp.accessibleName, fp.placeholder, fp.ariaLabel].some(
    (h) => h != null && SENSITIVE_NAME.test(h)
  )
}

// --- candidate building + uniqueness ----------------------------------------
function buildCandidateDescriptors(fp) {
  const list = []
  const seen = {}
  for (const attr of TESTID_ATTRS) if (fp.testAttributes[attr]) { list.push({ kind: 'testId', attribute: attr, value: fp.testAttributes[attr] }); seen[attr] = true }
  for (const attr in fp.testAttributes) if (!seen[attr]) list.push({ kind: 'testId', attribute: attr, value: fp.testAttributes[attr] })
  if (fp.role && fp.accessibleName) list.push({ kind: 'role', role: fp.role, name: fp.accessibleName })
  if (fp.label) list.push({ kind: 'label', value: fp.label })
  if (fp.id) list.push({ kind: 'id', value: fp.id })
  if (fp.name) list.push({ kind: 'name', value: fp.name })
  if (fp.placeholder) list.push({ kind: 'placeholder', value: fp.placeholder })
  if (fp.text && fp.text.length <= 40) list.push({ kind: 'text', value: fp.text })
  if (fp.classSelector) list.push({ kind: 'css', value: fp.classSelector })
  return list
}
function candidateSelector(c) {
  const q = (s) => String(s).replace(/"/g, '\\"')
  switch (c.kind) {
    case 'testId': return '[' + c.attribute + '="' + q(c.value) + '"]'
    case 'role': return c.name ? 'role=' + c.role + '[name="' + q(c.name) + '"]' : 'role=' + c.role
    case 'label': return 'internal:label="' + q(c.value) + '"i'
    case 'placeholder': return '[placeholder="' + q(c.value) + '"]'
    case 'id': return '[id="' + q(c.value) + '"]'
    case 'name': return '[name="' + q(c.value) + '"]'
    case 'text': return 'text=' + c.value
    case 'css': return c.value
    default: return c.value || ''
  }
}
async function enrichCandidates(page, fp) {
  const descriptors = buildCandidateDescriptors(fp)
  const out = []
  for (const c of descriptors) {
    let matchedElements = -1
    try {
      matchedElements = await page.locator(candidateSelector(c)).count()
    } catch (e) {}
    out.push({ ...c, matchedElements: matchedElements })
  }
  return out
}

/**
 * Build candidates from a pointerdown snapshot when the live element is gone
 * (a click that navigated). Only kinds counted in-page pre-navigation are
 * emitted, so uniqueness stays truthful; role/label/text are dropped rather
 * than faked, and testId/id/name (the reliable ones) survive with real counts.
 */
function candidatesFromSnapshot(fp, counts) {
  return buildCandidateDescriptors(fp)
    .map((c) => {
      let key = null
      if (c.kind === 'testId') key = 'testId:' + c.attribute
      else if (c.kind === 'id' || c.kind === 'name' || c.kind === 'placeholder' || c.kind === 'css') key = c.kind
      if (key == null || counts[key] == null) return null
      return { ...c, matchedElements: counts[key] }
    })
    .filter(Boolean)
}

// --- main -------------------------------------------------------------------
let pw
try {
  pw = require('playwright')
} catch (e) {
  fatal('PLAYWRIGHT_NOT_INSTALLED', 'Playwright is not installed in this workspace.')
  process.exit(0)
}

function versionOk() {
  try {
    const v = require('playwright/package.json').version.split('.').map((n) => parseInt(n, 10))
    const geMin = v[0] > SUPPORTED.min[0] || (v[0] === SUPPORTED.min[0] && v[1] >= SUPPORTED.min[1])
    const ltMax = v[0] < SUPPORTED.max[0] || (v[0] === SUPPORTED.max[0] && v[1] < SUPPORTED.max[1])
    return { ok: geMin && ltMax, version: v.join('.') }
  } catch (e) {
    return { ok: false, version: 'unknown' }
  }
}

let browser = null
let context = null
let activePage = null
let seq = 0
let currentSeq = -1
let shuttingDown = false
/** Fingerprint + queryable counts captured at the last pointerdown (pre-navigation). */
let lastPointer = null

// Serial enrichment queue so actions emit in capture order.
let queue = Promise.resolve()
function enqueue(fn) {
  queue = queue.then(fn).catch((e) => log('enqueue error: ' + (e && e.message)))
}

async function overlaySuppress(page) {
  const css = 'x-pw-glass{opacity:0 !important;pointer-events:none !important}'
  try {
    await page.addStyleTag({ content: css })
  } catch (e) {}
}

function trackPage(page) {
  activePage = page
  page.addInitScript(INJECT).catch(() => {})
  overlaySuppress(page)
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) {
      overlaySuppress(page)
      emit({ t: 'status', phase: 'recording', url: page.url() })
    }
  })
}

async function enrichAction(page, a, isUpdate) {
  const raw = a.action
  const name = raw.name
  const pageGuid = (a.frame && a.frame.pageGuid) || 'p'

  // Actions without an element target (navigation, page open/close). Handle
  // BEFORE consuming a sequence number so skipped events leave no gap.
  if (name === 'navigate' || name === 'openPage' || name === 'closePage') {
    // Skip page bookkeeping and the initial blank open — only real navigations
    // become "Open <url>" cards.
    if (name === 'closePage' || !raw.url || raw.url === 'about:blank') return
    const navSeq = isUpdate ? currentSeq : (currentSeq = seq++)
    emit({ t: isUpdate ? 'actionUpdated' : 'action', seq: navSeq, pageGuid: pageGuid, action: { name: 'navigate', url: raw.url } })
    return
  }

  const usedSeq = isUpdate ? currentSeq : (currentSeq = seq++)

  let fp = null
  let fromSnapshot = false
  try {
    if (raw.selector) fp = await page.locator(raw.selector).first().evaluate((el) => window.__suisuiFp(el))
  } catch (e) {}
  // The live element is gone (e.g. a click that navigated) — fall back to the
  // pointerdown snapshot captured before the navigation.
  if (!fp && lastPointer && lastPointer.fp) {
    fp = lastPointer.fp
    fromSnapshot = true
  }

  const secret = isSensitive(fp)
  const action = { name: name }
  if (raw.selector) action.selector = raw.selector
  if (raw.key) action.key = raw.key
  if (typeof raw.modifiers === 'number') action.modifiers = raw.modifiers
  if (raw.options) action.options = raw.options
  if (raw.files) action.files = raw.files
  if (typeof raw.checked === 'boolean') action.checked = raw.checked
  if (raw.button) action.button = raw.button
  if (typeof raw.clickCount === 'number') action.clickCount = raw.clickCount
  if (!secret && typeof raw.text === 'string') action.text = raw.text // value redacted at source

  let candidates = []
  if (fp) {
    try {
      candidates = fromSnapshot ? candidatesFromSnapshot(fp, lastPointer.counts || {}) : await enrichCandidates(page, fp)
    } catch (e) {}
  }

  emit({
    t: isUpdate ? 'actionUpdated' : 'action',
    seq: usedSeq,
    pageGuid: pageGuid,
    action: action,
    ...(fp ? { fingerprint: fp } : {}),
    ...(candidates.length ? { candidates: candidates } : {}),
    ...(secret ? { secret: true } : {}),
  })
}

async function doPick(pickId) {
  const page = activePage
  if (!page) { emit({ t: 'pickCancelled', pickId: pickId }); return }
  emit({ t: 'status', phase: 'picking' })
  try {
    await page.evaluate(() => { if (window.__pw_recorderSetMode) window.__pw_recorderSetMode('none') })
  } catch (e) {}
  let fp = null
  try {
    fp = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const box = document.createElement('div')
          const s = box.style
          s.position = 'fixed'; s.zIndex = '2147483647'; s.pointerEvents = 'none'
          s.background = 'rgba(80,140,255,.25)'; s.border = '1px solid #508cff'; s.boxSizing = 'border-box'
          document.documentElement.appendChild(box)
          const move = (e) => {
            const el = (e.composedPath && e.composedPath()[0]) || e.target
            if (!el || !el.getBoundingClientRect) return
            const r = el.getBoundingClientRect()
            s.left = r.left + 'px'; s.top = r.top + 'px'; s.width = r.width + 'px'; s.height = r.height + 'px'
          }
          const click = (e) => {
            e.preventDefault(); e.stopImmediatePropagation(); e.stopPropagation()
            const el = (e.composedPath && e.composedPath()[0]) || e.target
            cleanup()
            resolve(window.__suisuiFp(el))
          }
          const cleanup = () => {
            window.removeEventListener('mousemove', move, true)
            window.removeEventListener('click', click, true)
            box.remove()
          }
          window.addEventListener('mousemove', move, true)
          window.addEventListener('click', click, { capture: true, once: true })
        })
    )
  } catch (e) {}
  try {
    await page.evaluate(() => { if (window.__pw_recorderSetMode) window.__pw_recorderSetMode('recording') })
  } catch (e) {}
  emit({ t: 'status', phase: 'recording' })
  if (!fp) { emit({ t: 'pickCancelled', pickId: pickId }); return }
  let candidates = []
  try { candidates = await enrichCandidates(page, fp) } catch (e) {}
  emit({ t: 'picked', pickId: pickId, pageGuid: 'active', fingerprint: fp, candidates: candidates })
}

async function doHighlight(selector) {
  const page = activePage
  if (!page) return
  try {
    await page.evaluate((sel) => {
      const id = '__suisui_highlight__'
      let box = document.getElementById(id)
      if (!box) {
        box = document.createElement('div'); box.id = id
        const s = box.style
        s.position = 'fixed'; s.zIndex = '2147483647'; s.pointerEvents = 'none'
        s.background = 'rgba(80,140,255,.2)'; s.border = '2px solid #508cff'; s.boxSizing = 'border-box'
        document.documentElement.appendChild(box)
      }
      const el = document.querySelector(sel)
      if (el) {
        const r = el.getBoundingClientRect()
        box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px'
        box.style.display = 'block'
        setTimeout(() => { box.style.display = 'none' }, 1500)
      }
    }, selector)
  } catch (e) {}
}

async function doValidate(selector, requestId) {
  const page = activePage
  let matched = 0
  try { matched = await page.locator(selector).count() } catch (e) {}
  emit({ t: 'validate', requestId: requestId, unique: matched === 1, matchedElements: matched, stillMatches: matched > 0 })
}

async function main() {
  const vr = versionOk()
  if (!vr.ok) {
    fatal('UNSUPPORTED_PLAYWRIGHT', 'Playwright ' + vr.version + ' is not supported (need >=1.49 <1.61).')
    process.exit(0)
  }
  try {
    browser = await pw.chromium.launch({ headless: false })
  } catch (e) {
    const msg = (e && e.message) || ''
    if (/Executable doesn't exist|npx playwright install/i.test(msg)) fatal('BROWSER_BINARY_MISSING', 'The browser binary is missing. Run: npx playwright install')
    else fatal('BROWSER_LAUNCH_FAILED', 'The browser failed to launch: ' + msg)
    process.exit(0)
  }
  context = await browser.newContext()
  if (typeof context._enableRecorder !== 'function') {
    fatal('RECORDER_API_CHANGED', 'This Playwright version does not expose the recorder API.')
    await browser.close().catch(() => {})
    process.exit(0)
  }

  // Receives each pointerdown snapshot (fingerprint + pre-navigation counts).
  try {
    await context.exposeBinding('__suisuiCapture', (_src, data) => { lastPointer = data })
  } catch (e) {}
  await context.addInitScript(INJECT).catch(() => {})
  context.on('page', (page) => trackPage(page))

  let guardOk = true
  await context._enableRecorder(
    { mode: 'recording', recorderMode: 'api', language: 'javascript', testIdAttributeName: TEST_ID_ATTR, handleSIGINT: false },
    {
      actionAdded: (page, a) => {
        if (guardOk && (!a || !a.action || typeof a.action.name !== 'string' || !a.frame)) {
          guardOk = false
          fatal('RECORDER_API_CHANGED', 'Unexpected recorder event shape.')
          return
        }
        enqueue(() => enrichAction(page, a, false))
      },
      actionUpdated: (page, a) => enqueue(() => enrichAction(page, a, true)),
      signalAdded: (page, s) => {
        const sig = (s && s.signal) || s
        if (sig && sig.name === 'navigation' && sig.url) emit({ t: 'status', phase: 'recording', url: sig.url })
      },
    }
  )

  const page = await context.newPage()
  trackPage(page)
  emit({ t: 'ready', playwrightVersion: vr.version, browser: 'chromium' })
  emit({ t: 'status', phase: 'recording', url: START_URL || 'about:blank' })
  if (START_URL) {
    try { await page.goto(START_URL) } catch (e) { log('goto failed: ' + (e && e.message)) }
  }

  context.on('close', () => {
    // A close we didn't initiate means the user closed the browser mid-session.
    if (!shuttingDown) emit({ t: 'error', code: 'TARGET_PAGE_CLOSED', message: 'The browser was closed.', fatal: true })
    process.exit(0)
  })
}

// --- stdin command loop -----------------------------------------------------
let stdinBuf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  stdinBuf += chunk
  let idx
  while ((idx = stdinBuf.indexOf('\n')) >= 0) {
    const line = stdinBuf.slice(0, idx).trim()
    stdinBuf = stdinBuf.slice(idx + 1)
    if (line) handleCommand(line)
  }
})

async function setMode(mode) {
  if (!activePage) return
  try { await activePage.evaluate((m) => { if (window.__pw_recorderSetMode) window.__pw_recorderSetMode(m) }, mode) } catch (e) {}
}

function handleCommand(line) {
  let cmd
  try { cmd = JSON.parse(line) } catch (e) { return }
  switch (cmd.cmd) {
    case 'pause': setMode('none').then(() => emit({ t: 'status', phase: 'paused' })); break
    case 'resume': setMode('recording').then(() => emit({ t: 'status', phase: 'recording' })); break
    case 'goto': if (activePage && cmd.url) activePage.goto(cmd.url).catch(() => {}); break
    case 'pick': doPick(cmd.pickId); break
    case 'cancelPick': setMode('recording').then(() => emit({ t: 'pickCancelled', pickId: cmd.pickId })); break
    case 'highlight': doHighlight(cmd.selector); break
    case 'validate': doValidate(cmd.selector, cmd.requestId); break
    case 'stop': shutdown(); break
    case '_debugClick': if (DEBUG && activePage) activePage.locator(cmd.selector).click().catch((e) => log('debugClick: ' + e.message)); break
    case '_debugFill': if (DEBUG && activePage) activePage.locator(cmd.selector).fill(cmd.value || '').catch((e) => log('debugFill: ' + e.message)); break
    default: break
  }
}

async function shutdown() {
  shuttingDown = true
  try { if (context && context._disableRecorder) await context._disableRecorder() } catch (e) {}
  try { if (browser) await browser.close() } catch (e) {}
  process.exit(0)
}
process.on('SIGTERM', () => { shutdown() })

main().catch((e) => { fatal('ADAPTER_CRASHED', (e && e.message) || 'Recorder crashed.'); process.exit(1) })
