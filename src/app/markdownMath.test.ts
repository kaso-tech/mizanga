import { describe, expect, it } from 'vitest'
import { hasMath, normalizeMath } from './markdownMath'

describe('markdownMath', () => {
  it('reconnaît les formules mais pas un simple montant en dollars', () => {
    expect(hasMath('Le prix est de 5 $ ou 10 $.')).toBe(false)
    expect(hasMath('Aire : $$\\pi r^2$$')).toBe(true)
    expect(hasMath('On a \\(x = 2\\).')).toBe(true)
    expect(hasMath('\\[a^2 + b^2 = c^2\\]')).toBe(true)
  })

  it('convertit \\( \\) et \\[ \\] en $$', () => {
    expect(normalizeMath('On a \\( x = 2 \\).')).toBe('On a $$x = 2$$.')
    expect(normalizeMath('\\[a^2 + b^2 = c^2\\]')).toBe('\n$$\na^2 + b^2 = c^2\n$$\n')
  })
})
