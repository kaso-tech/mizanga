/** Événement non standard de Chrome / Edge / Android permettant de proposer l’installation. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

// Écouté dès le chargement du module : l’événement peut arriver avant l’affichage des paramètres.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferredPrompt = event as BeforeInstallPromptEvent
  notify()
})
window.addEventListener('appinstalled', () => {
  deferredPrompt = null
  notify()
})

export type InstallState = 'installed' | 'available' | 'ios' | 'unavailable'

export function getInstallState(): InstallState {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (standalone) return 'installed'
  if (deferredPrompt) return 'available'
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) return 'ios'
  return 'unavailable'
}

export function subscribeInstallState(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function promptInstall() {
  if (!deferredPrompt) return false
  await deferredPrompt.prompt()
  const { outcome } = await deferredPrompt.userChoice
  deferredPrompt = null
  notify()
  return outcome === 'accepted'
}

/** Enregistre le service worker (production uniquement, pour ne pas gêner le rechargement à chaud). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
