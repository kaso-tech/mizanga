import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

describe('fenêtre modale et bouton « retour » d’Android', () => {
  it('se ferme avec « retour » sans quitter la page', async () => {
    const onClose = vi.fn()
    window.history.replaceState({}, '', '/business')
    const before = window.history.length
    render(<Modal title="Nouvelle vente" onClose={onClose}><p>Contenu</p></Modal>)
    expect(window.history.length).toBe(before + 1)
    window.history.back()
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(window.location.pathname).toBe('/business')
  })

  it('retire son entrée d’historique quand elle est fermée autrement', async () => {
    window.history.replaceState({}, '', '/business')
    const { unmount } = render(<Modal title="Nouvelle dépense" onClose={() => {}}><p>Contenu</p></Modal>)
    expect((window.history.state as { gilliModal?: string }).gilliModal).toBeTruthy()
    unmount()
    await waitFor(() => expect((window.history.state as { gilliModal?: string } | null)?.gilliModal).toBeUndefined())
    expect(window.location.pathname).toBe('/business')
  })
})
