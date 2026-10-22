import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-sans/400.css'
import '@fontsource/noto-sans/500.css'
import '@fontsource/noto-sans/600.css'
import '@fontsource/noto-sans/700.css'
import '@fontsource/noto-serif/600.css'
import { App } from './app/App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { registerServiceWorker } from './app/installPrompt'
import { migrateLegacyStorage } from './app/legacyStorage'
import { detectServer } from './services/remoteAiService'
import './styles/global.css'

// Avant toute lecture du stockage : reprise des données enregistrées sous l’ancien nom (Mizanga).
migrateLegacyStorage()
registerServiceWorker()

// Le moteur (Gemini ou démonstration) est choisi une fois, selon ce que le serveur annonce.
void detectServer().then(({ aiService, authConfig }) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App aiService={aiService} authConfig={authConfig} />
      </ErrorBoundary>
    </StrictMode>,
  )
})
