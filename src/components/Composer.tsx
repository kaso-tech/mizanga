import { ArrowUp, Bookmark, Check, FileText, Globe, Keyboard, LoaderCircle, Mic, Paperclip, Square, WifiOff, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { acceptAttribute, formatSize, isAudio, isImage } from '../app/attachments'
import { filterSavedPrompts, type SavedPrompt } from '../app/savedPrompts'
import { MAX_RECORDING_SECONDS, formatDuration, isVoiceRecordingSupported, useVoiceRecording } from '../app/voiceRecording'
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
  /** Consignes proposées quand le message commence par « / ». */
  savedPrompts?: SavedPrompt[]
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
  savedPrompts = [],
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showCharacters, setShowCharacters] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [canRecord] = useState(isVoiceRecordingSupported)
  const recording = useVoiceRecording({ onRecorded: (file) => onAddFiles([file]), onError: onNotify })
  const isRecording = recording.state === 'recording'
  const hasContent = value.trim().length > 0 || attachments.length > 0

  // « / » en début de message ouvre la liste des consignes enregistrées, filtrée par la suite du texte.
  const slashQuery = /^\/[^\n]*$/.test(value) ? value.slice(1) : null
  const [menuDismissedFor, setMenuDismissedFor] = useState<string | null>(null)
  const [activePrompt, setActivePrompt] = useState(0)
  const promptMatches = slashQuery !== null && menuDismissedFor !== value ? filterSavedPrompts(savedPrompts, slashQuery).slice(0, 8) : []
  const showPromptHint = value === '/' && savedPrompts.length === 0 && menuDismissedFor !== value
  const isPromptMenuOpen = promptMatches.length > 0
  const selectedPrompt = Math.min(activePrompt, Math.max(promptMatches.length - 1, 0))

  const choosePrompt = (prompt: SavedPrompt) => {
    onValueChange(prompt.prompt)
    setActivePrompt(0)
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      textarea?.focus()
      textarea?.setSelectionRange(prompt.prompt.length, prompt.prompt.length)
    })
  }

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
    if (!hasContent || isGenerating || isOffline || isPreparingFiles || isRecording) return
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

  return (
    <div className="composer-wrap">
      {isOffline && (
        <p className="offline-banner" role="status">
          <WifiOff size={16} aria-hidden="true" />
          Vous êtes hors connexion. Votre message est conservé : vous pourrez l’envoyer dès le retour du réseau.
        </p>
      )}
      {isPromptMenuOpen && (
        <ul className="prompt-menu" role="listbox" id="prompt-menu" aria-label="Consignes enregistrées">
          {promptMatches.map((prompt, index) => (
            <li
              key={prompt.id}
              id={`prompt-option-${prompt.id}`}
              role="option"
              aria-selected={index === selectedPrompt}
              className={index === selectedPrompt ? 'is-active' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActivePrompt(index)}
              onClick={() => choosePrompt(prompt)}
            >
              <Bookmark size={14} aria-hidden="true" />
              <span className="prompt-menu-text"><strong>{prompt.title}</strong><span>{prompt.prompt}</span></span>
            </li>
          ))}
          <li className="prompt-menu-help" aria-hidden="true">↑ ↓ pour choisir · Entrée pour insérer · Échap pour fermer</li>
        </ul>
      )}
      {showPromptHint && (
        <p className="prompt-menu prompt-menu-empty" role="status">
          Aucune consigne enregistrée. Enregistrez un de vos messages avec son bouton <Bookmark size={13} aria-label="signet" />, ou ajoutez-en dans Paramètres › Personnalisation.
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
        {isRecording && (
          <div className="recording-bar" role="status">
            <span className="recording-dot" aria-hidden="true" />
            <span className="recording-time">{formatDuration(recording.elapsed)} / {formatDuration(MAX_RECORDING_SECONDS)}</span>
            <span className="recording-note">Enregistrement… La compréhension du mooré parlé n’est pas encore garantie.</span>
            <button type="button" className="secondary-button" onClick={recording.cancel}>Annuler</button>
            <button type="button" className="primary-button" onClick={recording.stop}><Check size={16} aria-hidden="true" /> Terminer</button>
          </div>
        )}
        {(attachments.length > 0 || isPreparingFiles || recording.state === 'processing') && (
          <ul className="attachment-list" aria-label="Fichiers joints">
            {attachments.map((attachment) => (
              <li key={attachment.id} className="attachment-chip">
                {isImage(attachment) && attachment.data
                  ? <img src={`data:${attachment.mimeType};base64,${attachment.data}`} alt="" />
                  : <span className="attachment-icon">{isAudio(attachment) ? <Mic size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}</span>}
                <span className="attachment-text"><span className="attachment-name">{attachment.name}</span><span className="attachment-size">{formatSize(attachment.size)}</span></span>
                <button type="button" aria-label={`Retirer ${attachment.name}`} onClick={() => onRemoveAttachment(attachment.id)}><X size={14} /></button>
              </li>
            ))}
            {(isPreparingFiles || recording.state === 'processing') && (
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
          aria-controls={isPromptMenuOpen ? 'prompt-menu' : undefined}
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
            if (isPromptMenuOpen) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                const step = event.key === 'ArrowDown' ? 1 : -1
                setActivePrompt((selectedPrompt + step + promptMatches.length) % promptMatches.length)
                return
              }
              if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
                event.preventDefault()
                choosePrompt(promptMatches[selectedPrompt])
                return
              }
            }
            if ((isPromptMenuOpen || showPromptHint) && event.key === 'Escape') {
              event.preventDefault()
              setMenuDismissedFor(value)
              return
            }
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
          <button
            type="button"
            className={`composer-tool ${isRecording ? 'is-recording' : ''}`}
            disabled={!canRecord || recording.state === 'processing'}
            aria-pressed={isRecording}
            aria-label={!canRecord ? 'Message vocal (non pris en charge par ce navigateur)' : isRecording ? 'Terminer l’enregistrement' : 'Enregistrer un message vocal'}
            title={!canRecord ? 'Votre navigateur ne permet pas l’enregistrement audio' : isRecording ? 'Terminer l’enregistrement' : 'Enregistrer un message vocal'}
            onClick={() => (isRecording ? recording.stop() : void recording.start())}
          >
            <Mic size={20} />
          </button>
          <span className="composer-spacer" />
          {isGenerating ? (
            <button type="button" className="send-button is-stop" aria-label={stopLabel} title={stopLabel} onClick={onStop}>
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button type="button" className="send-button" aria-label="Envoyer" disabled={!hasContent || isOffline || isPreparingFiles || isRecording} onClick={submit}>
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
