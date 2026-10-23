import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AppView, Conversation, ConversationSummary } from '../domain/types'
import { Sidebar } from './Sidebar'

const general: Conversation = { id: 'conversation-1', title: 'Photosynthèse', messages: [{ id: 'm1', role: 'user', content: 'Explique', createdAt: '2026-10-22T10:00:00.000Z' }], createdAt: '2026-10-22T10:00:00.000Z', updatedAt: '2026-10-22T10:00:00.000Z' }
const assistant: ConversationSummary = { id: 'commerce-1', kind: 'commerce', businessId: 'b1', title: 'Ventes du mois', favorite: false, createdAt: '2026-10-23T09:00:00.000Z', updatedAt: '2026-10-23T09:00:00.000Z' }
const herd: ConversationSummary = { ...assistant, id: 'elevage-1', kind: 'elevage', title: 'Vaccins des poules', favorite: true, createdAt: '2026-10-21T09:00:00.000Z' }

function renderSidebar(activeView: AppView = 'chat') {
  const handlers = {
    onNavigate: vi.fn(),
    onSelectAccountConversation: vi.fn(),
    onRemoveAccountConversation: vi.fn(),
    onToggleAccountFavorite: vi.fn(),
    onAdminSection: vi.fn(),
  }
  render(
    <Sidebar
      activeView={activeView}
      conversations={[general]}
      savesConversations
      isOpen={false}
      onClose={() => {}}
      onNewConversation={() => {}}
      onSelectConversation={() => {}}
      onRemoveConversation={() => {}}
      onRenameConversation={() => {}}
      onToggleFavorite={() => {}}
      onPrintConversation={() => {}}
      account={{ status: 'signedIn', email: 'awa@example.bf' }}
      onSignIn={() => {}}
      onOpenAccount={() => {}}
      accountConversations={[assistant, herd]}
      adminSection="moderation"
      {...handlers}
    />,
  )
  return handlers
}

describe('menu latéral', () => {
  it('réunit les conversations de tous les espaces, reconnaissables à leur icône', async () => {
    const handlers = renderSidebar()
    const list = screen.getByRole('navigation', { name: 'Conversations de cette session' })
    expect(within(list).getAllByRole('button', { name: /^(Généraliste|Commerce|Élevage|Agriculture) : / }).map((button) => button.textContent)).toEqual(['Commerce : Ventes du mois', 'Généraliste : Photosynthèse', 'Élevage : Vaccins des poules'])

    await userEvent.click(within(list).getByRole('button', { name: 'Commerce : Ventes du mois' }))
    expect(handlers.onSelectAccountConversation).toHaveBeenCalledWith(assistant)

    // Conversation d’assistant : renommer et supprimer, mais pas d’export ni d’impression.
    await userEvent.click(within(list).getByRole('button', { name: 'Options pour « Ventes du mois »' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: /Exporter/ })).not.toBeInTheDocument()
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Supprimer/ }))
    expect(handlers.onRemoveAccountConversation).toHaveBeenCalledWith('commerce-1')

    // Le filtre Favoris s’applique aussi aux conversations d’assistant.
    await userEvent.click(screen.getByRole('button', { name: 'Favoris' }))
    expect(within(list).getAllByRole('button', { name: /^(Généraliste|Commerce|Élevage) : / }).map((button) => button.textContent)).toEqual(['Élevage : Vaccins des poules'])
  })

  it('affiche dans la console d’administration ses propres sections, sans les conversations', async () => {
    const handlers = renderSidebar('admin')
    const sidebar = screen.getByRole('complementary', { name: 'Navigation de la console' })
    expect(within(sidebar).queryByText('Photosynthèse')).not.toBeInTheDocument()
    expect(within(sidebar).queryByRole('button', { name: /Espace Business/ })).not.toBeInTheDocument()
    expect(within(sidebar).getByRole('button', { name: 'Modération marketplace' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(within(sidebar).getByRole('button', { name: 'Référence du mooré' }))
    expect(handlers.onAdminSection).toHaveBeenCalledWith('reference')
    await userEvent.click(within(sidebar).getByRole('button', { name: 'Retour à Gilli' }))
    expect(handlers.onNavigate).toHaveBeenCalledWith('chat')
  })
})
