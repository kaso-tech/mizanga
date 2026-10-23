// Conversations enregistrées sur le compte (chatbot généraliste et assistants de l’Espace Business).
import type { ConversationKind, ConversationSummary } from '../domain/types'
import { BusinessApiError } from './businessApi'

export interface StoredConversation extends ConversationSummary {
  messages: unknown[]
}

export interface ConversationUpload {
  id: string
  kind: ConversationKind
  businessId: string | null
  /** Absent : le titre déjà enregistré est gardé. */
  title?: string | null
  favorite?: boolean
  messages: unknown[]
  createdAt: string
  updatedAt: string
}

/** Résultat d’un enregistrement : `newer` quand une version plus récente existe déjà sur le compte. */
export type SaveResult = { saved: ConversationSummary } | { newer: StoredConversation }

export type ConversationsApi = ReturnType<typeof createConversationsApi>

/** @param getToken renvoie le jeton de connexion courant (renouvelé par Supabase si besoin). */
export function createConversationsApi(getToken: () => Promise<string | null>) {
  const request = async <T>(method: string, path: string, body?: unknown, { allowConflict = false } = {}): Promise<T & { status: number }> => {
    const token = await getToken()
    if (!token) throw new BusinessApiError('Connectez-vous pour enregistrer vos conversations.', 401)
    let response: Response
    try {
      response = await fetch(`/api/conversations${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new BusinessApiError('Le serveur de Gilli est injoignable.', 0)
    }
    const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null
    if ((!response.ok && !(allowConflict && response.status === 409)) || !data) throw new BusinessApiError(data?.error ?? 'Une erreur est survenue. Réessayez.', response.status)
    return { ...data, status: response.status }
  }

  return {
    list: async () => (await request<{ conversations: ConversationSummary[] }>('GET', '')).conversations,
    get: async (id: string) => (await request<{ conversation: StoredConversation }>('GET', `/${encodeURIComponent(id)}`)).conversation,
    save: async ({ id, ...conversation }: ConversationUpload): Promise<SaveResult> => {
      const result = await request<{ conversation: StoredConversation }>('PUT', `/${encodeURIComponent(id)}`, conversation, { allowConflict: true })
      return result.status === 409 ? { newer: result.conversation } : { saved: result.conversation }
    },
    update: async (id: string, changes: { title?: string; favorite?: boolean }) => (await request<{ conversation: ConversationSummary }>('PATCH', `/${encodeURIComponent(id)}`, changes)).conversation,
    remove: async (id: string) => { await request<{ deleted: boolean }>('DELETE', `/${encodeURIComponent(id)}`) },
  }
}
