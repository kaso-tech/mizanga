import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AiService } from '../domain/services'
import { App } from './App'

const instantService: AiService = {
  isDemonstration: true,
  async *generate() {
    yield { text: 'Réponse de test', language: 'fr' }
  },
}

const renderApp = (path = '/') => {
  window.history.replaceState({}, '', path)
  return render(<App aiService={instantService} />)
}

describe('App', () => {
  it('affiche l’accueil et rend les adresses canoniques', () => {
    renderApp('/inconnu')
    expect(screen.getByRole('heading', { name: /Comment puis-je vous aider/ })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  it('ouvre les paramètres depuis une adresse non canonique', () => {
    renderApp('/parametres/')
    expect(screen.getByRole('heading', { level: 1, name: 'Paramètres' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/parametres')
  })

  it('ignore les préférences enregistrées invalides', () => {
    localStorage.setItem('mizanga.preferences.v1', JSON.stringify({ responseLanguage: 'toString', theme: 'dark' }))
    renderApp()
    expect(screen.getByRole('combobox', { name: 'Langue de réponse' })).toHaveValue('auto')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('envoie un message, affiche la réponse et l’ajoute à l’historique', async () => {
    renderApp()
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Explique la photosynthèse{Enter}')
    expect(await screen.findByText('Réponse de test')).toBeInTheDocument()
    expect(screen.getByText('Démonstration — aucune IA réelle')).toBeInTheDocument()
    const sidebar = screen.getByRole('complementary', { name: 'Navigation principale' })
    expect(within(sidebar).getByRole('button', { name: 'Explique la photosynthèse' })).toBeInTheDocument()
  })

  it('exige un type d’erreur et une correction avant de préparer un signalement', async () => {
    renderApp()
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Bonjour{Enter}')
    await userEvent.click(await screen.findByRole('button', { name: /Signaler une erreur en mooré/ }))
    const dialog = screen.getByRole('dialog', { name: 'Signaler une erreur en mooré' })
    const submit = within(dialog).getByRole('button', { name: 'Préparer le signalement' })
    expect(submit).toBeDisabled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Grammaire' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Proposition de correction' }), 'ɛ')
    expect(submit).toBeEnabled()
    await userEvent.click(submit)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('navigue entre les sections des paramètres au clavier et supprime les conversations après confirmation', async () => {
    renderApp()
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Bonjour{Enter}')
    await screen.findByText('Réponse de test')
    // En-tête et barre latérale proposent chacun un accès aux paramètres.
    await userEvent.click(screen.getAllByRole('button', { name: 'Paramètres' })[0])

    const general = screen.getByRole('tab', { name: 'Général' })
    general.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    const data = screen.getByRole('tab', { name: 'Conversations et données' })
    expect(data).toHaveAttribute('aria-selected', 'true')
    expect(window.location.hash).toBe('#donnees')

    expect(screen.getByText('1 conversation')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tout supprimer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }))
    expect(screen.getByText('Aucune')).toBeInTheDocument()
  })
})
