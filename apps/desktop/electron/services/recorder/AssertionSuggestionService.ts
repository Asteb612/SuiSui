import type { AssertionSuggestion } from '@suisui/shared'

/** Minimal page snapshot compared before/after an interaction (child-supplied). */
export interface PageSnapshot {
  url: string
  title: string
}

/**
 * Derives non-binding assertion suggestions from a page-state change (US4 /
 * FR-028). Pure + deterministic (no DOM/browser) — the child supplies the
 * before/after snapshots. Suggestions are shown but never auto-added.
 */
export class AssertionSuggestionService {
  suggest(before: PageSnapshot, after: PageSnapshot): AssertionSuggestion[] {
    const suggestions: AssertionSuggestion[] = []

    if (after.url && after.url !== before.url) {
      const fragment = urlFragment(after.url)
      suggestions.push({
        id: `assertUrl:${fragment}`,
        type: 'assertUrl',
        value: fragment,
        label: `Verify that the URL contains "${fragment}"`,
      })
    }

    if (after.title && after.title !== before.title) {
      suggestions.push({
        id: `assertTitle:${after.title}`,
        type: 'assertTitle',
        value: after.title,
        label: `Verify that the page title contains "${after.title}"`,
      })
    }

    return suggestions
  }
}

function urlFragment(url: string): string {
  try {
    const parsed = new URL(url, 'http://placeholder')
    return parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : url
  } catch {
    return url
  }
}
