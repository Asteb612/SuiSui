import { describe, it, expectTypeOf } from 'vitest'
import { step, str, int, oneOf, opt, alt, cols, bindSteps } from '../step'
import type { StepPattern, DataTableArg } from '../typed'

describe('step pattern argument types', () => {
  it('infers a single cucumber capture', () => {
    expectTypeOf(step`I wait ${int()}s`).toEqualTypeOf<
      StepPattern<[number]>
    >()
  })

  it('infers string captures', () => {
    expectTypeOf(step`I fill ${str('f')} with ${str('v')}`).toEqualTypeOf<
      StepPattern<[string, string]>
    >()
  })

  it('infers a literal union from oneOf(... as const)', () => {
    expectTypeOf(
      step`as ${oneOf(['admin', 'user'] as const)}`,
    ).toEqualTypeOf<StepPattern<['admin' | 'user']>>()
  })

  it('opt and alt contribute no argument', () => {
    expectTypeOf(
      step`I wait ${int()} second${opt('s')}`,
    ).toEqualTypeOf<StepPattern<[number]>>()
    expectTypeOf(
      step`a ${alt(['x', 'y'])} ${int()}`,
    ).toEqualTypeOf<StepPattern<[number]>>()
  })

  it('infers a typed DataTable from cols(... as const)', () => {
    expectTypeOf(
      step`I submit ${cols(['Field', 'Value'] as const)}`,
    ).toEqualTypeOf<StepPattern<[DataTableArg<'Field' | 'Value'>]>>()
  })

  it('a step pattern is assignable to string', () => {
    expectTypeOf(step`plain ${int()}`).toMatchTypeOf<string>()
  })
})

describe('bindSteps callback inference', () => {
  type Fixtures = { page: { goto(url: string): void } }
  type GivenFn = (
    pattern: string | RegExp,
    cb: (fixtures: Fixtures, ...args: unknown[]) => unknown,
  ) => void

  it('types callback args from the pattern', () => {
    const { Given } = bindSteps({ Given: (() => {}) as GivenFn })

    Given(
      step`I log in as ${oneOf(['admin', 'user'] as const)} with ${int()}`,
      (fixtures, role, attempts) => {
        expectTypeOf(fixtures).toEqualTypeOf<Fixtures>()
        expectTypeOf(role).toEqualTypeOf<'admin' | 'user'>()
        expectTypeOf(attempts).toEqualTypeOf<number>()
      },
    )
  })

  it('re-types a single step function', () => {
    const Then = bindSteps((() => {}) as GivenFn)
    Then(step`I see ${str()}`, (fixtures, value) => {
      expectTypeOf(fixtures).toEqualTypeOf<Fixtures>()
      expectTypeOf(value).toEqualTypeOf<string>()
    })
  })
})
