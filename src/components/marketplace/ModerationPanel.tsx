import { BadgeCheck, Check, EyeOff, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { formatPhone, formatPrice, marketplaceApi, reportLabels, type ModerationItem } from '../../services/marketplaceApi'

const statuses: Array<{ id: string; label: string }> = [
  { id: 'review', label: 'À vérifier' },
  { id: 'pending', label: 'En attente' },
  { id: 'published', label: 'Publiées' },
  { id: 'rejected', label: 'Refusées' },
  { id: 'hidden', label: 'Masquées' },
]

function ModerationCard({ item, onDecide, onVerify }: {
  item: ModerationItem
  onDecide: (status: 'published' | 'rejected' | 'hidden' | 'review', reason?: string) => Promise<void>
  onVerify: (verified: boolean) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const act = async (work: () => Promise<void>) => {
    setIsBusy(true)
    setError('')
    try {
      await work()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’action a échoué.')
      setIsBusy(false)
    }
  }
  return (
    <li className="moderation-card">
      {item.photos.length > 0 && <div className="moderation-photos">{item.photos.map((photo) => <a key={photo} href={photo} target="_blank" rel="noopener noreferrer"><img src={photo} alt="" /></a>)}</div>}
      <p className="moderation-title"><strong>{item.title}</strong> · {formatPrice(item.price, item.currency)}</p>
      <p className="setting-description">{item.category}{item.subcategory ? ` › ${item.subcategory}` : ''} · {item.condition} · modifiée le {new Date(item.updatedAt).toLocaleString('fr', { dateStyle: 'short', timeStyle: 'short' })}</p>
      {item.reasons.length > 0 && <ul className="moderation-reasons">{item.reasons.map((text) => <li key={text}>{text}</li>)}</ul>}
      {item.description && <details><summary>Description</summary><p className="moderation-description">{item.description}</p></details>}
      {Object.keys(item.attributes).length > 0 && <p className="setting-description">Caractéristiques : {Object.entries(item.attributes).map(([key, value]) => `${key} ${String(value)}`).join(' · ')}</p>}
      {item.reports.length > 0 && (
        <details open>
          <summary>{item.reports.length} signalement{item.reports.length > 1 ? 's' : ''}</summary>
          <ul>{item.reports.map((report) => <li key={report.createdAt}>{reportLabels[report.reason] ?? report.reason}{report.details ? ` : ${report.details}` : ''}</li>)}</ul>
        </details>
      )}
      {item.seller && (
        <p className="setting-description">
          Vendeur : <strong>{item.seller.name}</strong> ({item.businessName}), {item.seller.city}
          {item.seller.whatsapp && ` · WhatsApp ${formatPhone(item.seller.whatsapp)}`}{item.seller.phone && ` · tél. ${formatPhone(item.seller.phone)}`}
          {' '}<button type="button" className="text-button" disabled={isBusy} onClick={() => void act(() => onVerify(!item.seller?.verified))}><BadgeCheck size={14} aria-hidden="true" /> {item.seller.verified ? 'Retirer le badge vérifié' : 'Marquer comme vérifié'}</button>
        </p>
      )}
      <label className="field">
        <span className="field-label">Motif communiqué au vendeur (refus ou masquage)</span>
        <input value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} placeholder="Par exemple : produit interdit (arme)" />
      </label>
      {error && <p className="message-error" role="alert">{error}</p>}
      <div className="moderation-actions">
        {item.status !== 'published' && <button type="button" className="primary-button" disabled={isBusy} onClick={() => void act(() => onDecide('published'))}><Check size={14} aria-hidden="true" /> Publier</button>}
        {item.status !== 'rejected' && item.status !== 'published' && <button type="button" className="secondary-button danger-text" disabled={isBusy} onClick={() => void act(() => onDecide('rejected', reason))}><X size={14} aria-hidden="true" /> Refuser</button>}
        {item.status === 'published' && <button type="button" className="secondary-button danger-text" disabled={isBusy} onClick={() => void act(() => onDecide('hidden', reason))}><EyeOff size={14} aria-hidden="true" /> Masquer</button>}
        {(item.status === 'rejected' || item.status === 'hidden' || item.status === 'pending') && <button type="button" className="secondary-button" disabled={isBusy} onClick={() => void act(() => onDecide('review'))}><RotateCcw size={14} aria-hidden="true" /> Remettre à vérifier</button>}
      </div>
    </li>
  )
}

/** Modération de la marketplace (console d’administration) : annonces à vérifier, décisions, badge vendeur. */
export function ModerationPanel({ onNotify }: { onNotify: (message: string, tone?: 'success' | 'info') => void }) {
  const [status, setStatus] = useState('review')
  const [items, setItems] = useState<ModerationItem[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async (current: string) => {
    setError('')
    setItems(null)
    try {
      setItems(await marketplaceApi.moderationQueue(current))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'File de modération indisponible.')
    }
  }, [])
  useEffect(() => { void load(status) }, [load, status])

  return (
    <div className="moderation-panel">
      <div className="segmented moderation-statuses" role="radiogroup" aria-label="Annonces">
        {statuses.map((option) => (
          <label key={option.id} className={status === option.id ? 'is-selected' : ''}>
            <input type="radio" name="moderation-status" checked={status === option.id} onChange={() => setStatus(option.id)} />
            {option.label}
          </label>
        ))}
      </div>
      {error && <p className="message-error" role="alert">{error}</p>}
      {!items && !error && <div className="page-loading" aria-busy="true" />}
      {items && items.length === 0 && <p className="setting-description">Aucune annonce dans cette liste.</p>}
      {items && items.length > 0 && (
        <ul className="moderation-list">
          {items.map((item) => (
            <ModerationCard
              key={`${item.id}-${item.revision}`}
              item={item}
              onDecide={async (decision, reason) => {
                await marketplaceApi.decide(item.id, item.revision, decision, reason)
                onNotify(decision === 'published' ? 'Annonce publiée.' : decision === 'rejected' ? 'Annonce refusée.' : decision === 'hidden' ? 'Annonce masquée.' : 'Annonce remise à vérifier.', 'success')
                await load(status)
              }}
              onVerify={async (verified) => {
                await marketplaceApi.setSellerVerified(item.businessId, verified)
                onNotify(verified ? 'Vendeur marqué comme vérifié.' : 'Badge vérifié retiré.', 'success')
                await load(status)
              }}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
