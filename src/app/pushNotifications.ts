// Notifications du téléphone (Web Push) pour les alertes de recherche : permission, abonnement auprès du
// navigateur, puis enregistrement de l’abonnement sur le compte.
import { fetchPushKey, type SavedApi } from '../services/savedApi'

export type PushState = 'unsupported' | 'denied' | 'enabled' | 'available'

export const isPushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** Clé VAPID (base64url) au format attendu par PushManager.subscribe. */
export function keyToBytes(key: string) {
  const padded = `${key}${'='.repeat((4 - (key.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register('/sw.js')
}

/** État des notifications sur cet appareil. */
export async function pushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'available'
  const subscription = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription().catch(() => null)
  return subscription ? 'enabled' : 'available'
}

/** Demande la permission, abonne l’appareil et l’enregistre sur le compte. */
export async function enablePush(api: SavedApi) {
  if (!isPushSupported()) throw new Error('Ce navigateur ne permet pas les notifications. Sur iPhone, installez d’abord Gilli sur l’écran d’accueil.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Les notifications ont été refusées. Vous pouvez les autoriser dans les réglages du navigateur.')
  const key = await fetchPushKey()
  if (!key) throw new Error('Les notifications ne sont pas encore disponibles sur Gilli.')
  const worker = await registration()
  const subscription = (await worker.pushManager.getSubscription()) ?? (await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) }))
  await api.subscribePush(subscription.toJSON())
}

/** Désabonne l’appareil (sur le compte et dans le navigateur). */
export async function disablePush(api: SavedApi) {
  const subscription = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()
  if (!subscription) return
  await api.unsubscribePush(subscription.endpoint).catch(() => undefined)
  await subscription.unsubscribe()
}

/** À la connexion : un appareil déjà abonné est rattaché au compte connecté (appareil partagé). */
export async function reattachPush(api: SavedApi) {
  if (!isPushSupported() || Notification.permission !== 'granted') return
  const subscription = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription().catch(() => null)
  if (subscription) await api.subscribePush(subscription.toJSON()).catch(() => undefined)
}
