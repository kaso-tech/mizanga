import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { AiServiceError, type AiService } from '../domain/services'
import { App } from './App'
import { createBackup } from './conversationStorage'
import { AuthError, type AccountUser, type AuthClient } from '../services/authService'

const instantService: AiService = {
  isDemonstration: true,
  label: 'Test',
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
    expect(screen.getByRole('heading', { name: /Que cherchez-vous/ })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  it('ouvre les paramètres depuis une adresse non canonique', async () => {
    renderApp('/parametres/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Paramètres' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/parametres')
  })

  it('ignore les préférences enregistrées invalides', async () => {
    localStorage.setItem('gilli.preferences.v1', JSON.stringify({ responseLanguage: 'toString', theme: 'dark' }))
    renderApp('/parametres#langue')
    expect(await screen.findByRole('combobox', { name: 'Langue des réponses' })).toHaveValue('auto')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('envoie un message, affiche la réponse et l’ajoute à l’historique', async () => {
    renderApp()
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Explique la photosynthèse{Enter}')
    expect(await screen.findByText('Réponse de test')).toBeInTheDocument()
    expect(screen.getByText('Démonstration — aucune IA réelle')).toBeInTheDocument()
    const sidebar = screen.getByRole('complementary', { name: 'Navigation principale' })
    expect(within(sidebar).getByRole('button', { name: 'Généraliste : Explique la photosynthèse' })).toBeInTheDocument()
  })


  it('navigue entre les sections des paramètres au clavier et supprime les conversations après confirmation', async () => {
    renderApp()
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Bonjour{Enter}')
    await screen.findByText('Réponse de test')
    // En-tête et barre latérale proposent chacun un accès aux paramètres.
    await userEvent.click(screen.getAllByRole('button', { name: 'Paramètres' })[0])

    const general = screen.getByRole('tab', { name: 'Général' })
    general.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    const data = screen.getByRole('tab', { name: 'Conversations et données' })
    expect(data).toHaveAttribute('aria-selected', 'true')
    expect(window.location.hash).toBe('#donnees')

    expect(screen.getByText('1 conversation')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tout supprimer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }))
    expect(screen.getByText('Aucune')).toBeInTheDocument()
  })

  it('arrête la génération avec Échap et ouvre une nouvelle conversation avec Ctrl+Maj+O', async () => {
    const hanging: AiService = {
      isDemonstration: false,
      label: 'Test',
      async *generate(_request, { signal }) {
        yield { text: 'Début' }
        await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))
      },
    }
    window.history.replaceState({}, '', '/')
    render(<App aiService={hanging} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Question{Enter}')
    await screen.findByText('Début')
    await userEvent.keyboard('{Escape}')
    expect(await screen.findByText('Génération arrêtée.', { selector: '.message-status' })).toBeInTheDocument()

    await userEvent.keyboard('{Control>}{Shift>}o{/Shift}{/Control}')
    expect(await screen.findByRole('heading', { name: /Que cherchez-vous/ })).toBeInTheDocument()
  })

  it('transmet les instructions personnelles enregistrées au moteur', async () => {
    const requests: Array<{ customInstructions: string }> = []
    const recording: AiService = {
      ...instantService,
      async *generate(request) {
        requests.push({ customInstructions: request.preferences.customInstructions })
        yield { text: 'ok' }
      },
    }
    window.history.replaceState({}, '', '/parametres#personnalisation')
    render(<App aiService={recording} />)
    const field = await screen.findByRole('textbox', { name: 'Instructions personnelles' })
    await userEvent.type(field, 'Réponds brièvement.')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
    expect(JSON.parse(localStorage.getItem('gilli.preferences.v1') ?? '{}').customInstructions).toBe('Réponds brièvement.')

    await userEvent.click(screen.getAllByRole('button', { name: /Nouvelle conversation/ })[0])
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Bonjour{Enter}')
    await screen.findByText('ok')
    expect(requests).toEqual([{ customInstructions: 'Réponds brièvement.' }])
  })

  it('restaure une sauvegarde sans dupliquer les conversations', async () => {
    renderApp('/parametres#donnees')
    const backup = createBackup([{ id: 'c1', title: 'Sauvegardée', createdAt: '2026-10-20T10:00:00.000Z', updatedAt: '2026-10-20T10:00:00.000Z', messages: [{ id: 'm1', role: 'user', content: 'Bonjour', createdAt: '2026-10-20T10:00:00.000Z' }] }])
    const input = await screen.findByLabelText('Fichier de sauvegarde')
    await userEvent.upload(input, new File([backup], 'sauvegarde.json', { type: 'application/json' }))
    expect(await screen.findByText(/1 conversation ajoutée/)).toBeInTheDocument()
    expect(screen.getByText('1 conversation')).toBeInTheDocument()
    expect(screen.getAllByText('Sauvegardée').length).toBeGreaterThan(0)

    await userEvent.upload(input, new File([backup], 'sauvegarde.json', { type: 'application/json' }))
    expect(await screen.findByText(/déjà à jour/)).toBeInTheDocument()
  })

  it('lit une réponse à voix haute et arrête la lecture', async () => {
    const speak = vi.fn()
    const cancel = vi.fn()
    vi.stubGlobal('speechSynthesis', { speak, cancel, getVoices: () => [], addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} })
    try {
      renderApp()
      await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Bonjour{Enter}')
      await userEvent.click(await screen.findByRole('button', { name: 'Écouter la réponse' }))
      expect(speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Réponse de test' }))
      await userEvent.click(screen.getByRole('button', { name: 'Arrêter la lecture' }))
      expect(cancel).toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Écouter la réponse' })).toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('enregistre un message comme consigne et la propose sur l’accueil et avec « / »', async () => {
    renderApp()
    const input = screen.getByRole('textbox', { name: 'Votre message' })
    await userEvent.type(input, 'Résume ce texte en 5 points{Enter}')
    await userEvent.click(await screen.findByRole('button', { name: 'Enregistrer comme consigne' }))
    expect(await screen.findByText(/Consigne enregistrée/)).toBeInTheDocument()

    await userEvent.keyboard('{Control>}{Shift>}o{/Shift}{/Control}')
    const chips = await screen.findByLabelText('Vos consignes')
    expect(within(chips).getByRole('button', { name: /Résume ce texte en 5 points/ })).toBeInTheDocument()

    await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), '/resum')
    const menu = screen.getByRole('listbox', { name: 'Consignes enregistrées' })
    expect(within(menu).getByRole('option', { selected: true })).toHaveTextContent('Résume ce texte en 5 points')
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('textbox', { name: 'Votre message' })).toHaveValue('Résume ce texte en 5 points')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Que cherchez-vous/ })).toBeInTheDocument()
  })

  it('ferme le menu des consignes avec Échap et garde le texte', async () => {
    localStorage.setItem('gilli.prompts.v1', JSON.stringify([{ id: 'p1', title: 'Courrier', prompt: 'Rédige un courrier' }]))
    renderApp()
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), '/')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Votre message' })).toHaveValue('/')
  })

  it('navigue entre les versions d’une réponse régénérée', async () => {
    let call = 0
    const counting: AiService = { ...instantService, async *generate() { call++; yield { text: `Réponse numéro ${call}` } } }
    window.history.replaceState({}, '', '/')
    render(<App aiService={counting} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Bonjour{Enter}')
    await screen.findByText('Réponse numéro 1')
    await userEvent.click(screen.getByRole('button', { name: 'Régénérer' }))
    await screen.findByText('Réponse numéro 2')
    const versions = screen.getByRole('group', { name: 'Versions de la réponse' })
    expect(versions).toHaveTextContent('2 / 2')
    await userEvent.click(within(versions).getByRole('button', { name: 'Version précédente' }))
    expect(await screen.findByText('Réponse numéro 1')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Versions de la réponse' })).toHaveTextContent('1 / 2')
  })

  it('applique la taille du texte choisie', async () => {
    renderApp('/parametres')
    await userEvent.selectOptions(await screen.findByLabelText('Taille du texte'), 'large')
    expect(document.documentElement.dataset.textSize).toBe('large')
  })

  it('met un message en attente hors connexion et l’envoie au retour du réseau', async () => {
    const sent: string[] = []
    const remote: AiService = { isDemonstration: false, label: 'Gemini', async *generate({ messages }) { sent.push(messages.at(-1)!.content); yield { text: 'Réponse en ligne' } } }
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      window.history.replaceState({}, '', '/')
      render(<App aiService={remote} />)
      await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Question hors ligne')
      await userEvent.click(screen.getByRole('button', { name: 'Envoyer au retour du réseau' }))
      expect(screen.getByText(/partira automatiquement/)).toBeInTheDocument()
      expect(sent).toEqual([])

      onLine.mockReturnValue(true)
      act(() => { window.dispatchEvent(new Event('online')) })
      expect(await screen.findByText('Réponse en ligne')).toBeInTheDocument()
      expect(sent).toEqual(['Question hors ligne'])
    } finally {
      onLine.mockRestore()
    }
  })

  it('assistant d’achat : affiche les annonces proposées en fiches et ouvre l’annonce dans la marketplace', async () => {
    const listing = { rank: 1, id: 'a1', title: 'Tecno Spark 20', price: 48000, currency: 'XOF', unit: 'pièce', condition: 'new', city: 'Ouagadougou', sellerName: 'Awa Téléphones', sellerVerified: true, photo: null, score: 90, reasons: ['Dans votre budget (48 000 F CFA)', 'Mémoire vive (RAM) : 8 Go'], warnings: [], overBudget: false, whatsapp: '22670123456', phone: null }
    const remote: AiService = { isDemonstration: false, label: 'Gemini', async *generate() { yield { text: '', listings: [listing] }; yield { text: 'Le [1] est le meilleur choix.' } } }
    window.history.replaceState({}, '', '/')
    render(<App aiService={remote} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Un téléphone à 50 000 F{Enter}')
    const results = await screen.findByRole('list', { name: 'Annonces proposées' })
    expect(within(results).getByText('Tecno Spark 20')).toBeInTheDocument()
    expect(within(results).getByText('Mémoire vive (RAM) : 8 Go')).toBeInTheDocument()
    expect(within(results).getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', expect.stringContaining('https://wa.me/22670123456'))
    expect(await screen.findByText(/Le \[1\] est le meilleur choix/)).toBeInTheDocument()
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ listing: null }, { status: 404 })))
    try {
      await userEvent.click(within(results).getByRole('link', { name: 'Voir l’annonce' }))
      expect(window.location.pathname).toBe('/marketplace/annonce/a1')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('quota épuisé : propose de réessayer, sans changer de modèle', async () => {
    const remote: AiService = {
      isDemonstration: false,
      label: 'Gemini',
      offersLiteModel: true,
      // eslint-disable-next-line require-yield -- le moteur refuse avant toute réponse
      async *generate() {
        throw new AiServiceError('La limite d’utilisation gratuite du moteur est atteinte.', undefined, 'quota')
      },
    }
    window.history.replaceState({}, '', '/')
    render(<App aiService={remote} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Bonjour{Enter}')
    expect(await screen.findByText(/La limite d’utilisation gratuite/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /modèle économe/ })).not.toBeInTheDocument()
  })


  it('imprime une conversation depuis son menu', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    try {
      renderApp()
      await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Bonjour{Enter}')
      await screen.findByText('Réponse de test')
      await userEvent.click(screen.getByRole('button', { name: /Options pour/ }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Imprimer ou PDF' }))
      await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
    } finally {
      print.mockRestore()
    }
  })

  it('ne montre plus l’outil d’évaluation aux utilisateurs et redirige son ancienne adresse vers la console', async () => {
    renderApp('/parametres#langue')
    expect(await screen.findByRole('heading', { level: 2, name: 'Langue et écriture' })).toBeInTheDocument()
    expect(screen.queryByText(/Évaluer la qualité du mooré/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Référence du mooré/)).not.toBeInTheDocument()
    cleanup()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ configured: false, authenticated: false })))
    try {
      renderApp('/evaluation')
      expect(window.location.pathname).toBe('/admin')
      expect(await screen.findByRole('heading', { name: 'Console fermée' })).toBeInTheDocument()
      expect(screen.getByText('ADMIN_EMAIL')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Évaluation' })).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('console : page de connexion seule (e-mail et mot de passe), puis son propre menu, sans l’interface des utilisateurs', async () => {
    let authenticated = false
    const overview = {
      version: { version: '0.1.0', commit: 'abc1234', builtAt: '2026-10-21T00:00:00.000Z' },
      engine: { provider: 'gemini', configured: true, model: 'modele-standard', liteModel: 'modele-econome' },
      reference: { sheetChars: 0, examples: 0, entries: 0, counts: { draft: 0, review: 0, rejected: 0 }, problems: [], sentChars: 0, maxChars: 24000, omittedExamples: 0, omittedEntries: 0 },
    }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/login') {
        const { email, password } = JSON.parse(String(init?.body)) as { email: string; password: string }
        if (email !== 'admin@gilli.test' || password !== 'bon-mot-de-passe') return Response.json({ error: 'Adresse e-mail ou mot de passe incorrect.' }, { status: 401 })
        authenticated = true
        return Response.json({ authenticated: true })
      }
      if (url === '/api/admin/session') return Response.json({ configured: true, authenticated, ...(authenticated ? { email: 'admin@gilli.test' } : {}) })
      if (url === '/api/admin/overview') return authenticated ? Response.json(overview) : Response.json({}, { status: 401 })
      if (url === '/api/admin/logout') {
        authenticated = false
        return Response.json({ authenticated: false })
      }
      return Response.json({}, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      renderApp('/admin')
      const email = await screen.findByLabelText('Adresse e-mail')
      // Avant connexion : ni sections de la console, ni menu ou en-tête des utilisateurs.
      expect(screen.queryByRole('navigation', { name: 'Sections de la console' })).not.toBeInTheDocument()
      expect(screen.queryByRole('complementary', { name: 'Navigation principale' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Ouvrir le menu' })).not.toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: 'Votre message' })).not.toBeInTheDocument()

      await userEvent.type(email, 'admin@gilli.test')
      await userEvent.type(screen.getByLabelText('Mot de passe'), 'mauvais{Enter}')
      expect(await screen.findByText('Adresse e-mail ou mot de passe incorrect.')).toBeInTheDocument()
      await userEvent.clear(screen.getByLabelText('Mot de passe'))
      await userEvent.type(screen.getByLabelText('Mot de passe'), 'bon-mot-de-passe{Enter}')
      expect(await screen.findByText('modele-standard')).toBeInTheDocument()

      // Connecté : une seule navigation (le menu de la console), le titre de la section en haut.
      const nav = screen.getByRole('navigation', { name: 'Sections de la console' })
      expect(screen.getAllByRole('navigation', { name: 'Sections de la console' })).toHaveLength(1)
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
      expect(screen.queryByRole('complementary', { name: 'Navigation principale' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: 'Moteur' })).toBeInTheDocument()
      expect(screen.getByText('admin@gilli.test')).toBeInTheDocument()
      await userEvent.click(within(nav).getByRole('button', { name: 'Évaluation' }))
      expect(screen.getByRole('heading', { level: 1, name: 'Évaluation' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: '1. Préparer les questions' })).toBeInTheDocument()
      expect(window.location.hash).toBe('#evaluation')

      await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }))
      expect(await screen.findByLabelText('Adresse e-mail')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Retour à Gilli' }))
      expect(await screen.findByRole('textbox', { name: 'Votre message' })).toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('n’affiche plus de choix de modèle et ouvre la marketplace depuis l’icône de l’en-tête', async () => {
    const tiers: string[] = []
    const remote: AiService = { isDemonstration: false, label: 'Gemini', offersLiteModel: true, async *generate({ preferences }) { tiers.push(preferences.modelTier); yield { text: 'ok' } } }
    localStorage.setItem('gilli.preferences.v1', JSON.stringify({ modelTier: 'lite' }))
    window.history.replaceState({}, '', '/')
    render(<App aiService={remote} />)
    expect(screen.queryByRole('combobox', { name: 'Modèle' })).not.toBeInTheDocument()
    // Une préférence « économe » enregistrée avant la refonte n’est plus appliquée.
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Bonjour{Enter}')
    await screen.findByText('ok')
    expect(tiers).toEqual(['standard'])
    // La marketplace n’est plus dans le menu latéral mais dans l’en-tête.
    expect(within(screen.getByRole('complementary', { name: 'Navigation principale' })).queryByRole('button', { name: 'Marketplace' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Espace vendeur' })).toBeInTheDocument()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).startsWith('/api/marketplace/categories')
      ? Response.json({ categories: [], conditions: {}, cities: [] })
      : Response.json({ total: 0, items: [] }))))
    try {
      await userEvent.click(screen.getByRole('button', { name: 'Marketplace' }))
      expect(window.location.pathname).toBe('/marketplace')
      expect(await screen.findByRole('button', { name: 'Marketplace' })).toHaveAttribute('aria-current', 'page')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('connecte un utilisateur avec un code reçu par e-mail, puis le déconnecte', async () => {
    let user: AccountUser | null = null
    const listeners = new Set<(user: AccountUser | null) => void>()
    const sent: string[] = []
    const client: AuthClient = {
      getUser: async () => user,
      onChange: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
      sendCode: async (email) => { sent.push(email) },
      verifyCode: async (email, code) => {
        if (code !== '123456') throw new AuthError('Code incorrect ou expiré. Vérifiez-le ou demandez-en un nouveau.')
        user = { id: 'u1', email }
        listeners.forEach((listener) => listener(user))
      },
      signOut: async () => { user = null; listeners.forEach((listener) => listener(null)) },
      accessToken: async () => (user ? 'jeton' : null),
    }
    window.history.replaceState({}, '', '/')
    render(<App aiService={instantService} authConfig={{ supabaseUrl: 'https://projet.supabase.co', publishableKey: 'sb_publishable_test' }} createAuthClient={async () => client} />)

    // L’en-tête et le menu latéral proposent tous deux la connexion, une fois la session lue.
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Se connecter' })).toHaveLength(2))
    await userEvent.click(screen.getAllByRole('button', { name: 'Se connecter' })[1])
    const dialog = await screen.findByRole('dialog', { name: 'Se connecter à Gilli' })
    await userEvent.type(within(dialog).getByLabelText('Adresse e-mail'), 'awa@example.bf{Enter}')
    expect(sent).toEqual(['awa@example.bf'])
    expect(await within(dialog).findByText(/Ouvrez le lien qu’il contient/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'J’ai reçu un code' }))
    const codeField = await within(dialog).findByLabelText('Code reçu par e-mail')
    await userEvent.type(codeField, '000000{Enter}')
    expect(await within(dialog).findByText(/Code incorrect ou expiré/)).toBeInTheDocument()
    await userEvent.clear(codeField)
    await userEvent.type(codeField, '123 456{Enter}')

    expect(await screen.findByText('Vous êtes connecté.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Se connecter à Gilli' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Compte : awa@example.bf' }))
    expect(await screen.findByText('awa@example.bf', { selector: '.setting-label' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }))
    expect(await screen.findByText('Vous êtes déconnecté.')).toBeInTheDocument()
    expect(screen.getByText('Invité')).toBeInTheDocument()
  })

  it('laisse la connexion indisponible quand les comptes ne sont pas configurés', () => {
    renderApp()
    expect(screen.getByRole('button', { name: 'Connexion (bientôt disponible)' })).toBeDisabled()
  })

  it('ferme la fenêtre quand le lien est ouvert dans un autre onglet, et annonce le résultat d’un lien', async () => {
    const listeners = new Set<(user: AccountUser | null) => void>()
    const client: AuthClient = {
      redirectOutcome: 'expired',
      getUser: async () => null,
      onChange: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
      sendCode: async () => {},
      verifyCode: async () => {},
      signOut: async () => {},
      accessToken: async () => null,
    }
    window.history.replaceState({}, '', '/')
    render(<App aiService={instantService} authConfig={{ supabaseUrl: 'https://projet.supabase.co', publishableKey: 'sb_publishable_test' }} createAuthClient={async () => client} />)
    expect(await screen.findByText(/Ce lien de connexion a expiré ou a déjà servi/)).toBeInTheDocument()

    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Se connecter' })).toHaveLength(2))
    await userEvent.click(screen.getAllByRole('button', { name: 'Se connecter' })[1])
    const dialog = await screen.findByRole('dialog', { name: 'Se connecter à Gilli' })
    await userEvent.type(within(dialog).getByLabelText('Adresse e-mail'), 'awa@example.bf{Enter}')
    await within(dialog).findByText(/Ouvrez le lien qu’il contient/)
    // Le lien est ouvert dans un autre onglet : Supabase prévient cet onglet-ci.
    act(() => listeners.forEach((listener) => listener({ id: 'u1', email: 'awa@example.bf' })))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Se connecter à Gilli' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Compte : awa@example.bf' })).toBeInTheDocument()
  })
})
