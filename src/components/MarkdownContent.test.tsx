import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarkdownContent } from './MarkdownContent'

describe('MarkdownContent', () => {
  it('affiche les formules avec KaTeX, chargé à la demande', async () => {
    const { container } = render(<MarkdownContent content={'Pythagore : $$a^2 + b^2 = c^2$$ et 5 $ restent du texte.'} />)
    await screen.findByText((_content, element) => element?.classList.contains('katex') ?? false)
    expect(container.querySelector('.katex')).not.toBeNull()
    expect(container.textContent).toContain('5 $ restent du texte.')
  })

  it('n’active pas KaTeX sans formule', () => {
    const { container } = render(<MarkdownContent content={'**Gras** et `code`'} />)
    expect(container.querySelector('strong')?.textContent).toBe('Gras')
    expect(container.querySelector('.katex')).toBeNull()
  })
})
