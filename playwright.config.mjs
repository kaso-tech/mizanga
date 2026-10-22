// Tests de bout en bout dans Chromium, avec l’écran, le tactile et le navigateur d’un téléphone Android.
// Préalable : pnpm build. Lancement : pnpm test:e2e (le serveur de test e2e/server.mjs démarre seul).
import { defineConfig, devices } from '@playwright/test'

const port = 4173

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // Une seule base de test partagée et une limite de requêtes par adresse : les tests s’exécutent à la suite.
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'fr-FR',
    timezoneId: 'Africa/Ouagadougou',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Petit écran Android courant (360 × 740) et grand écran récent (412 × 915).
    { name: 'Android 360 px (Galaxy S8)', use: { ...devices['Galaxy S8'] } },
    { name: 'Android 412 px (Pixel 7)', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node e2e/server.mjs',
    url: `http://127.0.0.1:${port}/api/health`,
    env: { E2E_PORT: String(port) },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
