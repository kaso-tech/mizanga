import { ArrowUp, ClipboardPaste, FileText, Globe, Keyboard, LoaderCircle, Mic, Paperclip, Square, WifiOff, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { acceptAttribute, formatSize, isImage } from '../app/attachments'
import { mooreCharacters } from '../data/content'
import type { Attachment } from '../domain/types'

interface ComposerProps {
  value: string
  isGenerating: boolean
  isDemonstration: boolean
  isOffline?: boolean
  stopLabel: string
  /** Change de valeur pour redonner le focus au champ (ex. après le choix d’une suggestion). */
  focusToken: number
  attachments: Attachment[]
  isPreparingFiles: boolean
  webSearch: boolean
  onToggleWebSearch: () => void
  onAddFiles: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  onValueChange: (value: string) => void
  onSend: (content: string) => void
  onStop: () => void
  onNotify: (message: string) => void
}

export function Composer({
  value,
  isGenerating,
  isDemonstration,
  isOffline = false,
  stopLabel,
  focusToken,
  attachments,
  isPreparingFiles,
  webSearch,
  onToggleWebSearch,
  onAddFiles,
  onRemoveAttachment,
  onValueChange,
  onSend,
  onStop,
  onNotify,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showCharacters, setShowCharacters] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const hasContent = value.trim().length > 0 || attachments.length > 0

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
    if (!hasContent || isGenerating || isOffline || isPreparingFiles) return
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
      {isOffline && (
        <p className="offline-banner" role="status">
          <WifiOff size={16} aria-hidden="true" />
          Vous êtes hors connexion. Votre message est conservé : vous pourrez l’envoyer dès le retour du réseau.
        </p>
      )}
      {showCharacters && (
        <div className="character-palette" role="group" aria-label="Caractères du mooré">
          {mooreCharacters.map((character) => (
            <button key={character} type="button" lang="mos" aria-label={`Insérer ${character}`} onClick={() => insert(character)}>
              {character}
            </button>
          ))}
        </div>
      )}
      <div
        className={`composer ${isDragging ? 'is-dragging' : ''}`}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes('Files')) return
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          if (event.dataTransfer.files.length === 0) return
          event.preventDefault()
          setIsDragging(false)
          onAddFiles([...event.dataTransfer.files])
        }}
      >
        {(attachments.length > 0 || isPreparingFiles) && (
          <ul className="attachment-list" aria-label="Fichiers joints">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="attachment-chip">
                {isImage(attachment) && attachment.data
                  ? <img src={`data:${attachment.mimeType};base64,${attachment.data}`} alt="" />
                  : <span className="attachment-icon"><FileText size={18} aria-hidden="true" /></span>}
                <span className="attachment-text"><span className="attachment-name">{attachment.name}</span><span className="attachment-size">{formatSize(attachment.size)}</span></span>
                <button type="button" aria-label={`Retirer ${attachment.name}`} onClick={() => onRemoveAttachment(attachment.id)}><X size={14} /></button>
              </li>
            ))}
            {isPreparingFiles && (
              <li className="attachment-chip is-loading" aria-live="polite">
                <LoaderCircle size={18} className="spin" aria-hidden="true" /> Préparation…
              </li>
            )}
          </ul>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          spellCheck={false}
          enterKeyHint="enter"
          aria-label="Votre message"
          placeholder="Demandez n’importe quoi, en français ou en mooré…"
          onChange={(event) => onValueChange(event.target.value)}
          onPaste={(event) => {
            // Une capture d’écran collée devient une pièce jointe ; le texte collé reste du texte.
            const files = [...event.clipboardData.files]
            if (files.length === 0) return
            event.preventDefault()
            onAddFiles(files)
          }}
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
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptAttribute}
            className="visually-hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              onAddFiles([...(event.target.files ?? [])])
              event.target.value = ''
            }}
          />
          <button
            type="button"
            className="composer-tool"
            aria-label="Joindre une photo ou un fichier"
            title="Joindre une photo, un PDF ou un fichier texte"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={20} />
          </button>
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
          <button
            type="button"
            className={`composer-pill ${webSearch ? 'is-active' : ''}`}
            aria-pressed={webSearch}
            title={webSearch ? 'Recherche web activée : la réponse citera ses sources' : 'Activer la recherche web'}
            onClick={onToggleWebSearch}
          >
            <Globe size={16} aria-hidden="true" />
            <span className="composer-pill-label">Recherche web</span>
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
            <button type="button" className="send-button" aria-label="Envoyer" disabled={!hasContent || isOffline || isPreparingFiles} onClick={submit}>
              <ArrowUp size={20} />
            </button>
          )}
        </div>
      </div>
      <p className="disclaimer">
        {isDemonstration ? 'Version de démonstration — le moteur d’IA n’est pas encore connecté.' : 'Mizanga peut se tromper, y compris en mooré. Vérifiez les informations importantes.'}
      </p>
    </div>
  )
}
