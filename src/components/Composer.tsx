import { ArrowUp, Mic, Paperclip } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface ComposerProps {
  value: string
  isSending: boolean
  onValueChange: (value: string) => void
  onSend: (content: string) => void
  onNotify: (message: string) => void
}

export function Composer({ value, isSending, onValueChange, onSend, onNotify }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 168)}px`
  }, [value])

  const submit = () => {
    const content = value
    if (!content.trim() || isSending) return
    onSend(content)
  }

  return (
    <div className="composer-wrap">
      <div className="composer" data-active={value.length > 0}>
        <button
          className="composer-tool"
          type="button"
          aria-label="Ajouter ou coller du texte"
          onClick={() => {
            textareaRef.current?.focus()
            onNotify('Vous pouvez coller votre texte dans la zone de saisie. L’import de documents arrive bientôt.')
          }}
        >
          <Paperclip size={19} />
        </button>
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          aria-label="Votre message"
          placeholder="Écrivez votre question en français ou en Mooré…"
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            const isDesktop = window.matchMedia('(min-width: 768px)').matches
            // Pendant une composition (touches mortes, IME), Entrée valide le caractère et ne doit pas envoyer.
            const isComposing = event.nativeEvent.isComposing || event.keyCode === 229
            if (event.key === 'Enter' && !event.shiftKey && isDesktop && !isComposing) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <button
          className="composer-tool is-disabled"
          type="button"
          disabled
          title="Bientôt disponible"
          aria-label="Dictée vocale — bientôt disponible"
        >
          <Mic size={19} />
          <span className="soon-dot" aria-hidden="true" />
        </button>
        <button
          className="send-button"
          type="button"
          aria-label="Envoyer le message"
          disabled={!value.trim() || isSending}
          onClick={submit}
        >
          <ArrowUp size={19} strokeWidth={2.4} />
        </button>
      </div>
      <p className="composer-hint"><kbd>Entrée</kbd> pour envoyer <span aria-hidden="true">·</span> <kbd>Maj</kbd> + <kbd>Entrée</kbd> pour une nouvelle ligne <span className="voice-soon">· Dictée : bientôt disponible</span></p>
    </div>
  )
}
