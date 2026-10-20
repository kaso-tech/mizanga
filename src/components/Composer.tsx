import { ArrowUp, ClipboardPaste, Keyboard, Mic, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { mooreCharacters } from '../data/content'

interface ComposerProps {
  value: string
  isGenerating: boolean
  isDemonstration: boolean
  stopLabel: string
  /** Change de valeur pour redonner le focus au champ (ex. après le choix d’une suggestion). */
  focusToken: number
  onValueChange: (value: string) => void
  onSend: (content: string) => void
  onStop: () => void
  onNotify: (message: string) => void
}

export function Composer({ value, isGenerating, isDemonstration, stopLabel, focusToken, onValueChange, onSend, onStop, onNotify }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showCharacters, setShowCharacters] = useState(false)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
  }, [value])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea || focusToken === 0) return
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  }, [focusToken])

  const submit = () => {
    if (!value.trim() || isGenerating) return
    onSend(value)
  }

  /** Insère le texte à la position du curseur, sans jamais modifier le reste de la saisie. */
  const insert = (text: string) => {
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? value.length
    const end = textarea?.selectionEnd ?? value.length
    onValueChange(value.slice(0, start) + text + value.slice(end))
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(start + text.length, start + text.length)
    })
  }

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) insert(text)
      else onNotify('Le presse-papiers est vide.')
    } catch {
      onNotify('Accès au presse-papiers refusé. Collez avec un appui long ou Ctrl+V.')
    }
  }

  return (
    <div className="composer-wrap">
      {showCharacters && (
        <div className="character-palette" role="group" aria-label="Caractères du mooré">
          {mooreCharacters.map((character) => (
            <button key={character} type="button" lang="mos" aria-label={`Insérer ${character}`} onClick={() => insert(character)}>
              {character}
            </button>
          ))}
        </div>
      )}
      <div className="composer">
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          spellCheck={false}
          enterKeyHint="enter"
          aria-label="Votre message"
          placeholder="Demandez n’importe quoi, en français ou en mooré…"
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            const isTouch = window.matchMedia('(pointer: coarse)').matches
            // Pendant une composition (touches mortes, IME), Entrée valide le caractère et ne doit pas envoyer.
            const isComposing = event.nativeEvent.isComposing || event.keyCode === 229
            if (event.key === 'Enter' && !event.shiftKey && !isTouch && !isComposing) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <div className="composer-toolbar">
          <button
            type="button"
            className={`composer-tool ${showCharacters ? 'is-active' : ''}`}
            aria-label="Caractères du mooré"
            aria-pressed={showCharacters}
            title="Caractères du mooré"
            onClick={() => setShowCharacters((shown) => !shown)}
          >
            <Keyboard size={20} />
          </button>
          <button type="button" className="composer-tool" aria-label="Coller du texte" title="Coller du texte" onClick={paste}>
            <ClipboardPaste size={20} />
          </button>
          <button type="button" className="composer-tool" disabled aria-label="Dictée vocale (bientôt disponible)" title="Dictée vocale — bientôt disponible">
            <Mic size={20} />
          </button>
          <span className="composer-spacer" />
          {isGenerating ? (
            <button type="button" className="send-button is-stop" aria-label={stopLabel} title={stopLabel} onClick={onStop}>
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button type="button" className="send-button" aria-label="Envoyer" disabled={!value.trim()} onClick={submit}>
              <ArrowUp size={20} />
            </button>
          )}
        </div>
      </div>
      <p className="disclaimer">
        {isDemonstration ? 'Version de démonstration — le moteur d’IA n’est pas encore connecté.' : 'Mizanga peut faire des erreurs ; vérifiez les informations importantes.'}
      </p>
    </div>
  )
}
