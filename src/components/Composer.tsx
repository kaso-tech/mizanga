import { ArrowUp, ChevronDown, Globe2, Languages, Mic, Plus, Square } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { responseLanguageLabels } from '../data/content'
import type { ResponseLanguage } from '../domain/types'

interface ComposerProps {
  value: string
  placeholder: string
  isGenerating: boolean
  stopLabel: string
  responseLanguage: ResponseLanguage
  /** Change de valeur pour redonner le focus au champ (ex. après le choix d’une suggestion). */
  focusToken: number
  onValueChange: (value: string) => void
  onResponseLanguageChange: (language: ResponseLanguage) => void
  onSend: (content: string) => void
  onStop: () => void
  onNotify: (message: string) => void
}

export function Composer({
  value,
  placeholder,
  isGenerating,
  stopLabel,
  responseLanguage,
  focusToken,
  onValueChange,
  onResponseLanguageChange,
  onSend,
  onStop,
  onNotify,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
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

  return (
    <div className="composer" data-active={value.length > 0}>
      <textarea
        ref={textareaRef}
        value={value}
        rows={1}
        aria-label="Votre message"
        placeholder={placeholder}
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
      <div className="composer-toolbar">
        <button
          className="composer-icon is-outlined"
          type="button"
          aria-label="Joindre un fichier"
          title="Joindre un fichier"
          onClick={() => {
            textareaRef.current?.focus()
            onNotify('Vous pouvez coller votre texte dans la zone de saisie. L’import de fichiers arrive bientôt.')
          }}
        >
          <Plus size={18} />
        </button>
        <button className="composer-pill web-search-pill" type="button" disabled title="Bientôt disponible">
          <Globe2 size={16} aria-hidden="true" />
          Recherche web
          <span className="soon-badge">bientôt</span>
        </button>
        <label className="composer-pill language-pill" title="Langue des réponses">
          <Languages size={16} aria-hidden="true" />
          <span className="visually-hidden">Langue des réponses</span>
          <select value={responseLanguage} onChange={(event) => onResponseLanguageChange(event.target.value as ResponseLanguage)}>
            {Object.entries(responseLanguageLabels).map(([language, label]) => (
              <option key={language} value={language}>{language === 'auto' ? 'Langue : Automatique' : label}</option>
            ))}
          </select>
          <ChevronDown size={14} aria-hidden="true" />
        </label>
        <span className="composer-spacer" />
        <button className="composer-icon" type="button" disabled aria-label="Dictée vocale — bientôt disponible" title="Dictée vocale — bientôt disponible">
          <Mic size={18} />
        </button>
        {isGenerating ? (
          <button className="send-button is-stop" type="button" aria-label={stopLabel} title={stopLabel} onClick={onStop}>
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button className="send-button" type="button" aria-label="Envoyer le message" disabled={!value.trim()} onClick={submit}>
            <ArrowUp size={18} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </div>
  )
}
