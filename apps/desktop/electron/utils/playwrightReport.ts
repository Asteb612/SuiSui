import type {
  BatchRunResult,
  FeatureRunResult,
  ScenarioRunResult,
  RunSummary,
} from '@suisui/shared'

// --- Playwright JSON reporter types (internal) ---

interface PlaywrightJsonReport {
  suites: PlaywrightSuite[]
  stats?: {
    startTime: string
    duration: number
    expected: number
    unexpected: number
    skipped: number
    flaky: number
  }
}

interface PlaywrightSuite {
  title: string
  file?: string
  suites?: PlaywrightSuite[]
  specs?: PlaywrightSpec[]
}

interface PlaywrightSpec {
  title: string
  ok: boolean
  tests: PlaywrightTest[]
}

interface PlaywrightTest {
  expectedStatus: string
  status: string
  results: PlaywrightTestResult[]
}

interface PlaywrightTestResult {
  status: string
  duration: number
  errors?: Array<{ message?: string; stack?: string }>
}

export function extractFeatureRelativePath(generatedPath: string): string {
  // .features-gen/features/auth/login.feature.spec.js → features/auth/login.feature
  const match = generatedPath.match(/\.features-gen\/(.+?)\.spec\.[jt]s$/)
  return match?.[1] ?? generatedPath
}

export function parsePlaywrightJsonReport(
  jsonStr: string,
  rawStdout: string,
  rawStderr: string,
  totalDuration: number,
): BatchRunResult {
  let report: PlaywrightJsonReport
  try {
    report = JSON.parse(jsonStr) as PlaywrightJsonReport
  } catch {
    return {
      status: 'error',
      featureResults: [],
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, features: 0 },
      duration: totalDuration,
      stdout: rawStdout,
      stderr: rawStderr || 'Failed to parse JSON reporter output',
      errors: [],
    }
  }

  const featureResults: FeatureRunResult[] = []

  function collectScenarioResults(suite: PlaywrightSuite, results: ScenarioRunResult[]): void {
    if (suite.specs) {
      for (const spec of suite.specs) {
        const test = spec.tests[0]
        const result = test?.results[0]
        results.push({
          name: spec.title,
          status:
            result?.status === 'passed'
              ? 'passed'
              : result?.status === 'skipped'
                ? 'skipped'
                : 'failed',
          duration: result?.duration ?? 0,
          error: result?.errors?.[0]?.message,
        })
      }
    }
    if (suite.suites) {
      for (const sub of suite.suites) {
        collectScenarioResults(sub, results)
      }
    }
  }

  function collectFeatureSuites(suite: PlaywrightSuite): void {
    if (suite.file?.includes('.features-gen/')) {
      const relativePath = extractFeatureRelativePath(suite.file)
      const scenarioResults: ScenarioRunResult[] = []
      collectScenarioResults(suite, scenarioResults)

      const status: 'passed' | 'failed' | 'skipped' = scenarioResults.some(
        (s) => s.status === 'failed',
      )
        ? 'failed'
        : scenarioResults.every((s) => s.status === 'skipped')
          ? 'skipped'
          : 'passed'

      featureResults.push({
        relativePath,
        name: suite.title,
        status,
        duration: scenarioResults.reduce((sum, s) => sum + s.duration, 0),
        scenarioResults,
      })
      return
    }
    if (suite.suites) {
      for (const child of suite.suites) {
        collectFeatureSuites(child)
      }
    }
  }

  for (const rootSuite of report.suites) {
    collectFeatureSuites(rootSuite)
  }

  const allScenarios = featureResults.flatMap((f) => f.scenarioResults)
  const summary: RunSummary = {
    total: allScenarios.length,
    passed: allScenarios.filter((s) => s.status === 'passed').length,
    failed: allScenarios.filter((s) => s.status === 'failed').length,
    skipped: allScenarios.filter((s) => s.status === 'skipped').length,
    features: featureResults.length,
  }

  return {
    status: summary.failed > 0 ? 'failed' : 'passed',
    featureResults,
    summary,
    duration: report.stats?.duration ?? totalDuration,
    stdout: rawStdout,
    stderr: rawStderr,
    errors: [],
  }
}
