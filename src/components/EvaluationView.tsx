import { Download, Play, RotateCcw, Square, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  downloadText,
  itemsFromCsv,
  loadEvaluation,
  resultsCsv,
  saveEvaluation,
  summarize,
  templateCsv,
  verdictLabels,
  type EvaluationItem,
  type Verdict,
} from '../app/evaluation'
import { responseLanguageLabels } from '../data/content'
import { AiServiceError, type AiService } from '../domain/services'
import type { LinguisticPreferences } from '../domain/types'

interface EvaluationViewProps {
  aiService: AiService
  preferences: LinguisticPreferences
  onNotify: (message: string) => void
}

const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(resolve, ms)
  signal.addEventListener('abort', () => {
    window.clearTimeout(timer)
    reject(new DOMException('Aborted', 'AbortError'))
  }, { once: true })
})

/**
 * Outil d’évaluation : des locuteurs importent leurs questions (CSV), Mizanga y répond une à une,
 * chaque réponse est notée puis les résultats sont exportés. Rien n’est envoyé ailleurs qu’au moteur.
 */
export function EvaluationView({ aiService, preferences, onNotify }: EvaluationViewProps) {
  const [items, setItems] = useState<EvaluationItem[]>(loadEvaluation)
  const [delaySeconds, setDelaySeconds] = useState(6)
  const [runningId, setRunningId] = useState<string>()
  const [confirmingClear, setConfirmingClear] = useState(false)
  const controllerRef = useRef<AbortController>()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const summary = summarize(items)
  const isRunning = runningId !== undefined

  useEffect(() => saveEvaluation(items), [items])
  useEffect(() => () => controllerRef.current?.abort(), [])

  const update = (id: string, changes: Partial<EvaluationItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)))
  }

  const importFile = async (file: File) => {
    const { items: imported, problems } = itemsFromCsv(await file.text())
    if (imported.length > 0) {
      setItems(imported)
      onNotify(`${imported.length} question${imported.length > 1 ? 's' : ''} importée${imported.length > 1 ? 's' : ''}.${problems.length ? ` ${problems.join(' ')}` : ''}`)
    } else {
      onNotify(problems.join(' '))
    }
  }

  const ask = async (item: EvaluationItem, signal: AbortSignal) => {
    let answer = ''
    const request = {
      messages: [{ id: `eval-${item.id}`, role: 'user' as const, content: item.question, createdAt: new Date().toISOString() }],
      preferences: { ...preferences, responseLanguage: item.responseLanguage ?? preferences.responseLanguage },
    }
    for await (const chunk of aiService.generate(request, { signal })) answer += chunk.text
    return answer
  }

  /** Pose les questions sans réponse (ou celles demandées) une à une, avec une pause pour respecter le quota. */
  const run = async (targets: EvaluationItem[]) => {
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      for (const [index, item] of targets.entries()) {
        if (index > 0) await wait(delaySeconds * 1000, controller.signal)
        setRunningId(item.id)
        try {
          const answer = await ask(item, controller.signal)
          update(item.id, { answer, error: undefined, answeredAt: new Date().toISOString() })
        } catch (error) {
          if (controller.signal.aborted) throw error
          const message = error instanceof AiServiceError ? error.userMessage : 'La réponse n’a pas pu être produite.'
          update(item.id, { error: message, answer: undefined })
          if (error instanceof AiServiceError && error.retryAt) {
            onNotify(`Évaluation mise en pause : ${message}`)
            return
          }
        }
      }
      onNotify('Évaluation terminée : notez chaque réponse puis exportez les résultats.')
    } catch {
      // Arrêt demandé.
    } finally {
      setRunningId(undefined)
      controllerRef.current = undefined
    }
  }

  const pending = items.filter((item) => item.answer === undefined)
  const percent = (value: number) => (summary.rated ? `${Math.round((value / summary.rated) * 100)} %` : '—')

  return (
    <div className="evaluation-view">
      <p className="page-intro">Mesurez la qualité réelle des réponses de Mizanga avec des questions préparées et notées par des locuteurs du mooré.</p>

      <section className="settings-section">
        <h3>1. Préparer les questions</h3>
        <p className="evaluation-help">
          Téléchargez le modèle, remplissez une question par ligne (colonne « question », et si possible « reponse_attendue »), enregistrez-le en CSV puis importez-le.
          La colonne « langue_de_reponse » accepte : {Object.keys(responseLanguageLabels).join(', ')}.
        </p>
        <div className="evaluation-actions">
          <button type="button" className="secondary-button" onClick={() => downloadText(templateCsv(), 'mizanga-evaluation-modele.csv', 'text/csv;charset=utf-8')}>
            <Download size={16} aria-hidden="true" /> Télécharger le modèle (CSV)
          </button>
          <button type="button" className="secondary-button" disabled={isRunning} onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} aria-hidden="true" /> Importer un fichier CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="visually-hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importFile(file)
              event.target.value = ''
            }}
          />
        </div>
      </section>

      {items.length > 0 && (
        <>
          <section className="settings-section">
            <h3>2. Obtenir les réponses</h3>
            {aiService.isDemonstration && <p className="settings-callout">Aucun moteur d’IA n’est connecté : les réponses obtenues seront des messages de démonstration, sans valeur pour l’évaluation.</p>}
            <div className="evaluation-run">
              <label className="evaluation-delay">
                Pause entre deux questions
                <span className="select-control">
                  <select value={delaySeconds} disabled={isRunning} onChange={(event) => setDelaySeconds(Number(event.target.value))}>
                    {[3, 6, 10, 20].map((seconds) => <option key={seconds} value={seconds}>{seconds} s</option>)}
                  </select>
                </span>
              </label>
              {isRunning ? (
                <button type="button" className="danger-button" onClick={() => controllerRef.current?.abort()}>
                  <Square size={14} fill="currentColor" aria-hidden="true" /> Arrêter
                </button>
              ) : (
                <button type="button" className="primary-button" disabled={pending.length === 0} onClick={() => void run(pending)}>
                  <Play size={16} aria-hidden="true" /> {summary.answered === 0 ? 'Lancer l’évaluation' : `Poser les ${pending.length} question${pending.length > 1 ? 's' : ''} restante${pending.length > 1 ? 's' : ''}`}
                </button>
              )}
              <span className="value-pill" role="status">{summary.answered} / {summary.total} réponses · moteur : {aiService.label}</span>
            </div>
            <p className="evaluation-help">La pause évite d’atteindre la limite gratuite du moteur. Si elle est atteinte, l’évaluation se met en pause et l’heure de reprise est indiquée.</p>
          </section>

          <section className="settings-section">
            <h3>3. Noter les réponses</h3>
            <div className="evaluation-summary" aria-label="Résumé">
              <span className="value-pill">{summary.rated} notée{summary.rated > 1 ? 's' : ''} sur {summary.total}</span>
              <span className="value-pill is-correct">Correctes : {summary.correct} ({percent(summary.correct)})</span>
              <span className="value-pill is-partial">Partielles : {summary.partial} ({percent(summary.partial)})</span>
              <span className="value-pill is-incorrect">Incorrectes : {summary.incorrect} ({percent(summary.incorrect)})</span>
            </div>
            <ol className="evaluation-list">
              {items.map((item) => (
                <li key={item.id} className={`evaluation-item ${runningId === item.id ? 'is-running' : ''}`}>
                  <p className="evaluation-question"><span>Question {item.id}</span> {item.question}</p>
                  {item.expected && <p className="evaluation-expected"><span>Réponse attendue</span> {item.expected}</p>}
                  <div className="evaluation-answer" aria-busy={runningId === item.id || undefined}>
                    <span>Réponse de Mizanga{item.responseLanguage ? ` — ${responseLanguageLabels[item.responseLanguage]}` : ''}</span>
                    {runningId === item.id ? <p className="evaluation-muted">Réponse en cours…</p>
                      : item.error ? <p className="message-error">{item.error}</p>
                        : item.answer !== undefined ? <p className="evaluation-text">{item.answer}</p>
                          : <p className="evaluation-muted">Pas encore posée.</p>}
                  </div>
                  {item.answer !== undefined && (
                    <div className="evaluation-rating">
                      <div className="choice-row" role="radiogroup" aria-label={`Verdict pour la question ${item.id}`}>
                        {(Object.keys(verdictLabels) as Verdict[]).map((verdict) => (
                          <button
                            key={verdict}
                            type="button"
                            role="radio"
                            aria-checked={item.verdict === verdict}
                            className={`choice is-${verdict} ${item.verdict === verdict ? 'is-selected' : ''}`}
                            onClick={() => update(item.id, { verdict: item.verdict === verdict ? undefined : verdict })}
                          >
                            {verdictLabels[verdict]}
                          </button>
                        ))}
                      </div>
                      <label className="field">
                        <span className="visually-hidden">Commentaire pour la question {item.id}</span>
                        <textarea rows={2} lang="mos" placeholder="Commentaire ou correction (facultatif)" value={item.comment ?? ''} onChange={(event) => update(item.id, { comment: event.target.value })} />
                      </label>
                    </div>
                  )}
                  {!isRunning && (item.answer !== undefined || item.error) && (
                    <button type="button" className="text-button" onClick={() => void run([item])}><RotateCcw size={14} aria-hidden="true" /> Reposer la question</button>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <section className="settings-section">
            <h3>4. Exporter</h3>
            <p className="evaluation-help">Le fichier CSV s’ouvre dans Excel ou LibreOffice. L’évaluation en cours est gardée sur cet appareil jusqu’à ce que vous l’effaciez.</p>
            <div className="evaluation-actions">
              <button type="button" className="primary-button" disabled={summary.answered === 0} onClick={() => downloadText(resultsCsv(items, aiService.label), `mizanga-evaluation-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8')}>
                <Download size={16} aria-hidden="true" /> Exporter les résultats (CSV)
              </button>
              {confirmingClear ? (
                <>
                  <button type="button" className="secondary-button" onClick={() => setConfirmingClear(false)}>Annuler</button>
                  <button type="button" className="danger-button" onClick={() => { setItems([]); setConfirmingClear(false) }}>Confirmer l’effacement</button>
                </>
              ) : (
                <button type="button" className="danger-button is-outline" disabled={isRunning} onClick={() => setConfirmingClear(true)}>
                  <Trash2 size={16} aria-hidden="true" /> Effacer l’évaluation
                </button>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
