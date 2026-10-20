import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Broken(): never {
  throw new Error('Panne simulée')
}

describe('ErrorBoundary', () => {
  it('affiche un écran explicatif au lieu d’une page blanche', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<ErrorBoundary><Broken /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toHaveTextContent('Un problème est survenu')
    expect(screen.getByRole('button', { name: 'Recharger la page' })).toBeInTheDocument()
    expect(screen.getByText('Panne simulée')).toBeInTheDocument()
  })
})
