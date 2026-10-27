import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SavedApi } from '../services/savedApi'
import { enablePush, isPushSupported, keyToBytes, pushState } from './pushNotifications'

const api = () => ({ subscribePush: vi.fn(async () => ({})), unsubscribePush: vi.fn(async () => ({})) }) as unknown as SavedApi & { subscribePush: ReturnType<typeof vi.fn> }

/** Navigateur avec notifications : permission accordée ou refusée, abonnement simulé. */
function fakeBrowser(permission: NotificationPermission) {
  const subscription = { endpoint: 'https://push.example.test/abc', toJSON: () => ({ endpoint: 'https://push.example.test/abc', keys: { p256dh: 'p', auth: 'a' } }), unsubscribe: vi.fn() }
  const pushManager = { getSubscription: vi.fn(async () => null), subscribe: vi.fn(async () => subscription) }
  const registration = { pushManager }
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', { permission, requestPermission: vi.fn(async () => permission) })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: vi.fn(async () => registration), register: vi.fn(async () => registration) } })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ publicKey: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM' })))
  return { pushManager }
}

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
})

describe('notifications du téléphone', () => {
  it('convertit la clé VAPID (base64url) en octets', () => {
    expect([...keyToBytes('AQID_-8')]).toEqual([1, 2, 3, 255, 239])
  })

  it('sans prise en charge du navigateur : indisponible', async () => {
    expect(isPushSupported()).toBe(false)
    expect(await pushState()).toBe('unsupported')
  })

  it('demande la permission, abonne l’appareil avec la clé du serveur et l’enregistre sur le compte', async () => {
    const { pushManager } = fakeBrowser('granted')
    const saved = api()
    expect(await pushState()).toBe('available')
    await enablePush(saved)
    expect(pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) })
    expect(saved.subscribePush).toHaveBeenCalledWith({ endpoint: 'https://push.example.test/abc', keys: { p256dh: 'p', auth: 'a' } })
  })

  it('permission refusée : message clair, rien n’est enregistré', async () => {
    fakeBrowser('denied')
    const saved = api()
    expect(await pushState()).toBe('denied')
    await expect(enablePush(saved)).rejects.toThrow('Les notifications ont été refusées')
    expect(saved.subscribePush).not.toHaveBeenCalled()
  })
})
