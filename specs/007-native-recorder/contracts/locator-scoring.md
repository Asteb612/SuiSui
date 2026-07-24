# Contract: Locator Candidate Generation & Scoring

**Feature**: 007-native-recorder | **Phase**: 1
Pure, deterministic algorithm in `LocatorService` (main). Input: the child's `ElementFingerprint` + raw candidates (each with `matchedElements`) + `RecorderLocatorSettings`. Output: `LocatorCandidate[]` sorted by `score` desc. Unit-tested exhaustively (FR-007–FR-010; spec tests: candidate generation, scoring, generated-value detection, naming).

## 1. Candidate generation (from a fingerprint)

For a recorded element, propose candidates in this order (skipped if the setting disables the family or the source datum is absent):

| Kind                 | Built from                                                                      | Condition                                    |
| -------------------- | ------------------------------------------------------------------------------- | -------------------------------------------- |
| `testId`             | each attribute in `preferredTestIdAttributes` present on the element            | always (highest value)                       |
| `testId` (secondary) | other test-ish `data-*` (`data-automation`, `data-component`, any `data-test*`) | present                                      |
| `role`               | computed role + accessible name                                                 | `allowRoleLocators`                          |
| `label`              | associated `<label>` / `aria-label`                                             | present                                      |
| `placeholder`        | `placeholder`                                                                   | present                                      |
| `id`                 | `id`                                                                            | present                                      |
| `name`               | `name`                                                                          | present                                      |
| `text`               | trimmed visible text                                                            | `allowTextLocators` and text is short/stable |
| `css`                | class-based selector                                                            | `allowCssFallback`                           |
| `css` (nth)          | structural/nth-child fallback                                                   | `allowCssFallback` (last resort)             |

Uniqueness (`matchedElements`) is measured in the page by the child for every generated candidate.

## 2. Base scores (unique case)

```text
configured test-id attribute, unique      100
other test-related data attribute, unique  90
role + accessible name, unique             85
label, unique                              80
stable id, unique                          75
name attribute, unique                     70
placeholder, unique                        60
visible text, unique                       50
css class selector                         25
DOM position / nth-child                     5
```

## 3. Penalties & adjustments

```text
not unique (matchedElements > 1):  score = min(score, 20) ; +warning "Matches N elements on the page"
matchedElements === 0:             score = 0 ; +warning "No element currently matches"
contains a generated value:        score -= 40 ; +warning "Contains a value that looks generated"
id/attr value looks generated:     (as above) — applies to id/testId/css families
text is long (> ~40 chars) or looks dynamic: score -= 15 ; +warning "Text may change"
```

Final `score` clamped to `[0,100]`. `reliability` bucket: `>=90 excellent`, `70–89 good`, `40–69 fair`, `<40 poor`.

## 4. Generated-value detection (heuristics)

A value is "generated/unstable" if ANY match (case-insensitive):

```text
UUID              /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
long hex hash     /\b[0-9a-f]{8,}\b/
CSS-module hash   /_[A-Za-z0-9]{5,}$/  or  /__[A-Za-z0-9]{5,}\b/   (e.g. Button_root__x8Ff2)
random suffix     /[-_][A-Za-z0-9]{6,}$/  with mixed case/digits
long digit run    /\d{6,}/               (ids/timestamps)
epoch timestamp   /\b1[0-9]{9,12}\b/
nth-child/index   /:nth-child\(|\[\d+\]|>\s*\*/
```

Whole-word test-id _keys_ (e.g. `data-testid`) are never penalized; only their **values** are inspected. Human tokens (dictionary-ish, hyphen/underscore separated words like `login-submit`) are NOT flagged.

## 5. Reasons (positives, shown in the UI)

Emit as applicable: `"Dedicated testing attribute"`, `"Accessible role and name"`, `"Associated form label"`, `"Stable id"`, `"Unique on the current page"`, `"Does not contain a generated value"`. The recommended (top) candidate always shows at least one reason (SC-006).

## 6. Recommendation

`selectedLocator` defaults to `candidates[0]` (highest score). If the top score is `poor` (<40), the action is marked `needs-review` (FR "locator not unique / no longer matches") so the user is nudged to pick/confirm. Ties break by kind order in §1, then by shorter selector.

## 7. Human-readable element name (FR-013 — used for `label` and step args)

Preferred order (first non-empty wins):

```text
1. accessible name
2. associated <label> text
3. aria-label
4. button/link text
5. placeholder
6. test-id value → de-slugified ("login-submit" → "Login submit")
7. tagName + nearby text context ("Element near ‘Profile’")
```

Produces labels like `Button "Sign in"`, `Email field`, `Checkbox "Accept terms"`, `Element "user-profile-menu"`. The user is never required to read the CSS/selector (FR-013).

## 8. Determinism & testing

- Same fingerprint + same settings ⇒ identical candidate list and scores (no time/randomness).
- Unit fixtures cover: configured test-id unique (→100/excellent); test-id present alongside generated CSS classes (css penalized + warned); non-unique role; generated id; nth-child last-resort; naming order for each source; settings toggles removing families.
