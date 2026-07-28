import { describe, it, expect } from 'vitest'
import { normalize, tokenize, matchText, matchTag } from '../search/matcher'

describe('normalize', () => {
  it('lowercases', () => {
    expect(normalize('Checkout')).toBe('checkout')
  })

  it('strips accents so Connexion matches connexion', () => {
    expect(normalize('Connexion')).toBe(normalize('connexion'))
    expect(normalize('Éléphant')).toBe('elephant')
  })

  it('preserves length — MatchRange offsets index the original text', () => {
    const samples = ['Éléphant', 'Connexion à la page', 'straße', 'İstanbul', 'ÅÄÖ', 'naïve café']
    for (const s of samples) {
      expect(normalize(s), `length changed for ${s}`).toHaveLength(s.length)
    }
  })

  it('leaves non-letter characters in place', () => {
    expect(normalize('@smoke-test_1')).toBe('@smoke-test_1')
  })
})

describe('tokenize', () => {
  it('splits on whitespace and normalizes', () => {
    expect(tokenize('  Expired   Checkout ')).toEqual(['expired', 'checkout'])
  })

  it('returns an empty array for empty or whitespace-only input', () => {
    expect(tokenize('')).toEqual([])
    expect(tokenize('   ')).toEqual([])
  })
})

describe('matchText', () => {
  it('returns null when no token matches', () => {
    expect(matchText('Checkout with an expired card', tokenize('refund'))).toBeNull()
  })

  it('returns null for an empty query or empty text', () => {
    expect(matchText('Checkout', tokenize(''))).toBeNull()
    expect(matchText('', tokenize('checkout'))).toBeNull()
  })

  it('requires ALL tokens to be present', () => {
    expect(matchText('Checkout with an expired card', tokenize('expired refund'))).toBeNull()
  })

  it('is order-independent', () => {
    const result = matchText('Checkout with an expired card', tokenize('expired checkout'))
    expect(result).not.toBeNull()
  })

  it('is case- and accent-insensitive', () => {
    expect(matchText('Page de Connexion', tokenize('connexion'))).not.toBeNull()
    expect(matchText('Page de connexion', tokenize('CONNEXION'))).not.toBeNull()
  })

  it('treats regex metacharacters as literal text', () => {
    expect(matchText('Checkout (fast)', tokenize('(fast)'))).not.toBeNull()
    // `.*` must not behave as a wildcard
    expect(matchText('Checkout', tokenize('.*'))).toBeNull()
    expect(matchText('Price is 3.50', tokenize('3.50'))).not.toBeNull()
    expect(matchText('Price is 3X50', tokenize('3.50'))).toBeNull()
  })

  it('returns ranges that index the ORIGINAL text', () => {
    const text = 'Checkout with an expired card'
    const result = matchText(text, tokenize('expired'))
    expect(result).not.toBeNull()
    const [range] = result!.ranges
    expect(text.slice(range!.start, range!.end)).toBe('expired')
  })

  it('returns correct ranges against accented text', () => {
    const text = 'Page de Connexion'
    const result = matchText(text, tokenize('connexion'))
    const [range] = result!.ranges
    expect(text.slice(range!.start, range!.end)).toBe('Connexion')
  })

  it('merges overlapping ranges and sorts them', () => {
    const text = 'card card'
    const result = matchText(text, tokenize('card ard'))
    expect(result).not.toBeNull()
    const ranges = result!.ranges
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i]!.start).toBeGreaterThanOrEqual(ranges[i - 1]!.end)
    }
  })

  describe('score ladder', () => {
    const score = (text: string, query: string) => matchText(text, tokenize(query))?.score ?? -1

    it('ranks exact full-string match highest', () => {
      expect(score('Login', 'login')).toBe(100)
    })

    it('ranks a prefix match above a word-boundary match', () => {
      expect(score('Login page works', 'login')).toBe(80)
      expect(score('The login page', 'login')).toBe(60)
    })

    it('ranks a word-boundary match above a mid-word substring match', () => {
      expect(score('The login page', 'login')).toBeGreaterThan(score('Relogin flow', 'login'))
      expect(score('Relogin flow', 'login')).toBe(40)
    })

    it('orders exact > prefix > word > substring', () => {
      expect(score('Login', 'login')).toBeGreaterThan(score('Login page', 'login'))
      expect(score('Login page', 'login')).toBeGreaterThan(score('A login page', 'login'))
      expect(score('A login page', 'login')).toBeGreaterThan(score('Relogin', 'login'))
    })
  })
})

describe('matchTag', () => {
  it('matches with and without a leading @ on the query', () => {
    expect(matchTag('smoke', tokenize('smoke'))).not.toBeNull()
    expect(matchTag('smoke', tokenize('@smoke'))).not.toBeNull()
  })

  it('matches when the indexed tag itself carries a leading @', () => {
    expect(matchTag('@smoke', tokenize('smoke'))).not.toBeNull()
    expect(matchTag('@smoke', tokenize('@smoke'))).not.toBeNull()
  })

  it('scores 25 below the equivalent name match', () => {
    const name = matchText('smoke', tokenize('smoke'))!
    const tag = matchTag('smoke', tokenize('smoke'))!
    expect(tag.score).toBe(name.score - 25)
  })

  it('returns null when the tag does not match', () => {
    expect(matchTag('smoke', tokenize('regression'))).toBeNull()
  })
})
