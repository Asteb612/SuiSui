# `runner-filters` fixture

Exists so the runner's filter panel can be asserted against exact numbers, which
the other workspaces cannot give: `with-features` has no tags and no
`Scenario Outline`, and `tags` deliberately contains a malformed file.

Everything below is what a test may rely on.

| File                             | Folder          | Feature tag | Scenario                                 | Tests |
| -------------------------------- | --------------- | ----------- | ---------------------------------------- | ----- |
| `features/smoke.feature`         | `features`      | `@smoke`    | The app boots                            | 1     |
|                                  |                 |             | The header is present                    | 1     |
| `features/auth/login.feature`    | `features/auth` | `@auth`     | Sign in                                  | 1     |
|                                  |                 |             | `@slow` Locked out … (3 `Examples` rows) | 3     |
| `features/cart/checkout.feature` | `features/cart` | —           | `@smoke` Pay by card                     | 1     |
|                                  |                 |             | Cancel the order                         | 1     |

- **8 tests** across **3 features**, from **6 authored scenarios**. The gap is the
  outline, and it is the point: counting authored scenarios instead of tests gives
  6 and is wrong.
- Folders: `features`, `features/auth`, `features/cart`.
- Tags (feature tags are inherited by every scenario beneath them):
  `@smoke` → 3 tests (both in smoke.feature, plus Pay by card),
  `@auth` → 4 tests (all of login.feature),
  `@slow` → 3 tests (the outline alone).
- Combinations worth asserting: `features/auth` + `@slow` → 3;
  `smoke.feature` + `@smoke` → 2; `smoke.feature` + `@slow` → 0.

The steps are the bundled generic ones, so the workspace is well-formed — but no
test here runs Playwright. The filter panel reads `.feature` files only.
