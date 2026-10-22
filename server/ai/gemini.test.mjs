// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readUsage, streamGeminiReply } from './gemini.mjs'

afterEach(() => vi.unstubAllGlobals())

/** Réponse SSE de Gemini : un événement par objet. @param {unknown[]} events */
const sse = (events) => new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } })

describe('Gemini : jetons consommés et consignes propres à l’assistant Business', () => {
  it('lit les jetons d’entrée et de sortie, pensées comprises', () => {
    expect(readUsage({ promptTokenCount: 1200, candidatesTokenCount: 300, thoughtsTokenCount: 50 })).toEqual({ inputTokens: 1200, outputTokens: 350 })
    expect(readUsage(undefined)).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('remplace les consignes, retire la recherche web et termine par les jetons consommés', async () => {
    /** @type {any} */
    let sent
    vi.stubGlobal('fetch', vi.fn(async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
      sent = JSON.parse(String(init.body))
      return sse([
        { candidates: [{ content: { parts: [{ text: 'Votre marge ' }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 2 } },
        { candidates: [{ content: { parts: [{ text: 'est de 4 075 F CFA.' }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 12, thoughtsTokenCount: 30 } },
      ])
    }))
    const events = []
    for await (const event of streamGeminiReply({ apiKey: 'cle', model: 'gemini-test', messages: [{ role: 'user', content: 'Ma marge ?' }], preferences: {}, instructions: 'Consignes Business', webSearch: false })) events.push(event)
    expect(sent.systemInstruction).toEqual({ parts: [{ text: 'Consignes Business' }] })
    expect(sent.tools).toBeUndefined()
    expect(events).toEqual([{ text: 'Votre marge ' }, { text: 'est de 4 075 F CFA.' }, { usage: { inputTokens: 900, outputTokens: 42 } }])
  })

  it('garde la recherche web et les consignes de Gilli par défaut (chatbot)', async () => {
    /** @type {any} */
    let sent
    vi.stubGlobal('fetch', vi.fn(async (/** @type {string} */ _url, /** @type {RequestInit} */ init) => {
      sent = JSON.parse(String(init.body))
      return sse([{ candidates: [{ content: { parts: [{ text: 'Bonjour' }] } }] }])
    }))
    const events = []
    for await (const event of streamGeminiReply({ apiKey: 'cle', model: 'gemini-test', messages: [{ role: 'user', content: 'Salut' }], preferences: {} })) events.push(event)
    expect(sent.tools).toEqual([{ google_search: {} }])
    expect(sent.systemInstruction.parts[0].text).toMatch(/^Tu es Gilli/)
    expect(events).toEqual([{ text: 'Bonjour' }])
  })
})
