import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-sans/400.css'
import '@fontsource/noto-sans/500.css'
import '@fontsource/noto-sans/600.css'
import '@fontsource/noto-sans/700.css'
import '@fontsource/noto-serif/600.css'
import { App } from './app/App'
import { registerServiceWorker } from './app/installPrompt'
import { detectAiService } from './services/remoteAiService'
import './styles/global.css'

registerServiceWorker()

// Le moteur (Gemini ou démonstration) est choisi une fois, selon ce que le serveur annonce.
void detectAiService().then((aiService) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App aiService={aiService} />
    </StrictMode>,
  )
})
