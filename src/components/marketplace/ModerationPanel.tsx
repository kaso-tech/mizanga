import { BadgeCheck, Check, EyeOff, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { formatPhone, formatPrice, marketplaceApi, reportLabels, type ModerationItem, type ReviewModerationItem } from '../../services/marketplaceApi'
import { Stars } from './SellerTrust'

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

const reviewStatuses: Array<{ id: string; label: string }> = [
  { id: 'review', label: 'À vérifier' },
  { id: 'pending', label: 'En attente' },
  { id: 'published', label: 'Publiés' },
  { id: 'hidden', label: 'Masqués' },
]

/** Avis des clients : ceux que le contrôle automatique a signalés, publication ou masquage. */
function ReviewsModeration({ onNotify }: { onNotify: (message: string, tone?: 'success' | 'info') => void }) {
  const [status, setStatus] = useState('review')
  const [items, setItems] = useState<ReviewModerationItem[] | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async (current: string) => {
    setError('')
    setItems(null)
    try {
      setItems(await marketplaceApi.reviewQueue(current))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Avis indisponibles.')
    }
  }, [])
  useEffect(() => { void load(status) }, [load, status])
  const decide = async (item: ReviewModerationItem, decision: 'published' | 'hidden' | 'review') => {
    try {
      await marketplaceApi.decideReview(item.id, item.revision, decision)
      onNotify(decision === 'published' ? 'Avis publié.' : decision === 'hidden' ? 'Avis masqué.' : 'Avis remis à vérifier.', 'success')
      await load(status)
    } catch (caught) {
      onNotify(caught instanceof Error ? caught.message : 'L’action a échoué.', 'info')
    }
  }
  return (
    <>
      <div className="segmented moderation-statuses" role="radiogroup" aria-label="Avis">
        {reviewStatuses.map((option) => (
          <label key={option.id} className={status === option.id ? 'is-selected' : ''}>
            <input type="radio" name="review-status" checked={status === option.id} onChange={() => setStatus(option.id)} />
            {option.label}
          </label>
        ))}
      </div>
      {error && <p className="message-error" role="alert">{error}</p>}
      {!items && !error && <div className="page-loading" aria-busy="true" />}
      {items && items.length === 0 && <p className="setting-description">Aucun avis dans cette liste.</p>}
      {items && items.length > 0 && (
        <ul className="moderation-list" aria-label="Avis à modérer">
          {items.map((item) => (
            <li key={`${item.id}-${item.revision}`} className="moderation-card">
              <p className="moderation-title"><Stars rating={item.rating} /> <strong>{item.sellerName}</strong></p>
              <p className="setting-description">Modifié le {new Date(item.updatedAt).toLocaleString('fr', { dateStyle: 'short', timeStyle: 'short' })}</p>
              {item.reasons.length > 0 && <ul className="moderation-reasons">{item.reasons.map((text) => <li key={text}>{text}</li>)}</ul>}
              {item.comment ? <p className="moderation-description">{item.comment}</p> : <p className="setting-description">Sans commentaire.</p>}
              <div className="moderation-actions">
                {item.status !== 'published' && <button type="button" className="primary-button" onClick={() => void decide(item, 'published')}><Check size={14} aria-hidden="true" /> Publier</button>}
                {item.status !== 'hidden' && <button type="button" className="secondary-button danger-text" onClick={() => void decide(item, 'hidden')}><EyeOff size={14} aria-hidden="true" /> Masquer</button>}
                {item.status === 'hidden' && <button type="button" className="secondary-button" onClick={() => void decide(item, 'review')}><RotateCcw size={14} aria-hidden="true" /> Remettre à vérifier</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** Modération de la marketplace (console d’administration) : annonces et avis des clients. */
export function ModerationPanel({ onNotify }: { onNotify: (message: string, tone?: 'success' | 'info') => void }) {
  const [kind, setKind] = useState<'listings' | 'reviews'>('listings')
  return (
    <div className="moderation-panel">
      <div className="market-tabs" role="tablist" aria-label="Que modérer ?">
        <button type="button" role="tab" aria-selected={kind === 'listings'} className={`market-tab ${kind === 'listings' ? 'is-active' : ''}`} onClick={() => setKind('listings')}>Annonces</button>
        <button type="button" role="tab" aria-selected={kind === 'reviews'} className={`market-tab ${kind === 'reviews' ? 'is-active' : ''}`} onClick={() => setKind('reviews')}>Avis des clients</button>
      </div>
      {kind === 'listings' ? <ListingsModeration onNotify={onNotify} /> : <ReviewsModeration onNotify={onNotify} />}
    </div>
  )
}

/** Annonces à vérifier, décisions, badge vendeur. */
function ListingsModeration({ onNotify }: { onNotify: (message: string, tone?: 'success' | 'info') => void }) {
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
    <>
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
    </>
  )
}
