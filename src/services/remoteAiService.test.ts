import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiServiceError } from '../domain/services'
import { defaultPreferences } from '../domain/types'
import { createRemoteAiService, detectAiService } from './remoteAiService'
import { demoAiService } from './demoAiService'

const request = {
  messages: [{ id: 'u1', role: 'user' as const, content: 'Bonjour', createdAt: '2026-10-20T00:00:00.000Z' }],
  preferences: defaultPreferences,
}

/** Réponse dont le corps arrive en morceaux arbitraires (coupés au milieu des lignes). */
function streamedResponse(pieces: string[], init: ResponseInit = {}) {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece))
      controller.close()
    },
  })
  return new Response(body, { status: 200, ...init })
}

async function collect(service = createRemoteAiService({ label: 'Gemini' })) {
  let text = ''
  for await (const chunk of service.generate(request, { signal: new AbortController().signal })) text += chunk.text
  return text
}

afterEach(() => vi.unstubAllGlobals())

describe('remoteAiService', () => {
  it('reconstitue le texte même quand les lignes NDJSON arrivent coupées', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamedResponse(['{"text":"Bon', 'jour "}\n{"te', 'xt":"ɛ ʋ"}\n']))
    vi.stubGlobal('fetch', fetchMock)
    expect(await collect()).toBe('Bonjour ɛ ʋ')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/chat')
    expect(JSON.parse(init.body)).toEqual({
      messages: [{ role: 'user', content: 'Bonjour' }],
      preferences: { responseLanguage: 'auto', userWritingMode: 'standard' },
    })
  })

  it('remonte les erreurs du serveur avec leur message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Quota atteint.' }), { status: 429 })))
    await expect(collect()).rejects.toEqual(new AiServiceError('Quota atteint.'))

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamedResponse(['{"text":"Début"}\n{"error":"Coupure."}\n'])))
    await expect(collect()).rejects.toEqual(new AiServiceError('Coupure.'))
  })

  it('choisit Gemini seulement si le serveur l’annonce', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ engine: 'gemini', model: 'gemini-flash-latest' })))
    const live = await detectAiService()
    expect(live).toMatchObject({ isDemonstration: false, label: 'Gemini (gemini-flash-latest)' })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ engine: 'demo', model: null })))
    expect(await detectAiService()).toBe(demoAiService)

    // Site statique sans API : la route renvoie la page HTML.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } })))
    expect(await detectAiService()).toBe(demoAiService)
  })
})
