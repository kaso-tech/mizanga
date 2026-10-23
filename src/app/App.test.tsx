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
    expect(screen.getByRole('heading', { name: /Comment puis-je vous aider/ })).toBeInTheDocument()
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

  it('exige un type d’erreur et une correction avant de préparer un signalement', async () => {
    renderApp()
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Bonjour{Enter}')
    await userEvent.click(await screen.findByRole('button', { name: /Signaler une erreur en mooré/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Signaler une erreur en mooré' })
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
    expect(await screen.findByRole('heading', { name: /Comment puis-je vous aider/ })).toBeInTheDocument()
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
    expect(screen.getByRole('heading', { name: /Comment puis-je vous aider/ })).toBeInTheDocument()
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

  it('propose le modèle économe quand le quota est épuisé', async () => {
    const tiers: string[] = []
    const remote: AiService = {
      isDemonstration: false,
      label: 'Gemini',
      offersLiteModel: true,
      async *generate({ preferences }) {
        tiers.push(preferences.modelTier)
        if (preferences.modelTier === 'standard') throw new AiServiceError('La limite d’utilisation gratuite du moteur est atteinte.', undefined, 'quota')
        yield { text: 'Réponse économe' }
      },
    }
    window.history.replaceState({}, '', '/')
    render(<App aiService={remote} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Bonjour{Enter}')
    await userEvent.click(await screen.findByRole('button', { name: /Réessayer avec le modèle économe/ }))
    expect(await screen.findByText('Réponse économe')).toBeInTheDocument()
    expect(tiers).toEqual(['standard', 'lite'])
    expect(JSON.parse(localStorage.getItem('gilli.preferences.v1') ?? '{}').modelTier).toBe('lite')
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
      expect(await screen.findByText(/La console est fermée/)).toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: 'Évaluation' })).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('ouvre la console après connexion et donne accès à l’évaluation', async () => {
    let authenticated = false
    const overview = {
      version: { version: '0.1.0', commit: 'abc1234', builtAt: '2026-10-21T00:00:00.000Z' },
      engine: { provider: 'gemini', configured: true, model: 'modele-standard', liteModel: 'modele-econome' },
      reference: { sheetChars: 0, examples: 0, entries: 0, counts: { draft: 0, review: 0, rejected: 0 }, problems: [], sentChars: 0, maxChars: 24000, omittedExamples: 0, omittedEntries: 0 },
    }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/admin/login') {
        const { password } = JSON.parse(String(init?.body)) as { password: string }
        if (password !== 'bon-mot-de-passe') return Response.json({ error: 'Mot de passe incorrect.' }, { status: 401 })
        authenticated = true
        return Response.json({ authenticated: true })
      }
      if (url === '/api/admin/session') return Response.json({ configured: true, authenticated })
      if (url === '/api/admin/overview') return authenticated ? Response.json(overview) : Response.json({}, { status: 401 })
      return Response.json({}, { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      renderApp('/admin')
      const password = await screen.findByLabelText('Mot de passe')
      await userEvent.type(password, 'mauvais{Enter}')
      expect(await screen.findByText('Mot de passe incorrect.')).toBeInTheDocument()
      await userEvent.clear(password)
      await userEvent.type(password, 'bon-mot-de-passe{Enter}')
      expect(await screen.findByText('modele-standard')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('tab', { name: 'Évaluation' }))
      expect(screen.getByRole('heading', { name: '1. Préparer les questions' })).toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('choisit le modèle depuis l’en-tête quand le moteur en propose deux', async () => {
    const tiers: string[] = []
    const remote: AiService = { isDemonstration: false, label: 'Gemini', offersLiteModel: true, async *generate({ preferences }) { tiers.push(preferences.modelTier); yield { text: 'ok' } } }
    window.history.replaceState({}, '', '/')
    render(<App aiService={remote} />)
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Modèle' }), 'lite')
    await userEvent.type(screen.getByRole('textbox', { name: 'Votre message' }), 'Bonjour{Enter}')
    await screen.findByText('ok')
    expect(tiers).toEqual(['lite'])
    cleanup()

    renderApp()
    expect(screen.queryByRole('combobox', { name: 'Modèle' })).not.toBeInTheDocument()
    expect(screen.getByText('Démonstration', { selector: '.model-badge' })).toBeInTheDocument()
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
