import { BadgeCheck, CalendarDays, MessageSquareText, Star, Store } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { formatMonth, formatRating, type MyReview, type SellerReview, type SellerStats } from '../../services/marketplaceApi'
import { Modal } from '../Modal'
import type { MarketAccount } from './MarketplaceLists'

type Notify = (message: string, tone?: 'success' | 'info') => void

/** Étoiles pleines arrondies à la demi-étoile la plus proche, avec la note lisible pour les lecteurs d’écran. */
export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  const rounded = Math.round(rating)
  return (
    <span className="stars" role="img" aria-label={`${formatRating(rating)} sur 5`}>
      {[1, 2, 3, 4, 5].map((value) => <Star key={value} size={size} aria-hidden="true" fill={value <= rounded ? 'currentColor' : 'none'} />)}
    </span>
  )
}

/** « ★ 4,5 (12 avis) » ou rien si le vendeur n’a pas encore d’avis. */
export function RatingBadge({ rating, count }: { rating?: number | null; count?: number }) {
  if (typeof rating !== 'number' || !count) return null
  return <span className="rating-badge"><Star size={12} aria-hidden="true" fill="currentColor" /> {formatRating(rating)} <span className="rating-count">({count} avis)</span></span>
}

/** Statistiques publiques d’un vendeur : note, ancienneté, annonces en ligne, badge vérifié. */
export function SellerStatsLine({ stats, verified }: { stats?: SellerStats; verified: boolean }) {
  if (!stats) return null
  return (
    <ul className="seller-stats" aria-label="Le vendeur en bref">
      <li>{stats.rating !== null && stats.reviewCount > 0 ? <><Stars rating={stats.rating} /> {formatRating(stats.rating)} · {stats.reviewCount} avis</> : <><MessageSquareText size={14} aria-hidden="true" /> Pas encore d’avis</>}</li>
      <li><CalendarDays size={14} aria-hidden="true" /> Sur Gilli depuis {formatMonth(stats.memberSince)}</li>
      <li><Store size={14} aria-hidden="true" /> {stats.activeListings} annonce{stats.activeListings > 1 ? 's' : ''} en ligne</li>
      {verified && <li><BadgeCheck size={14} aria-hidden="true" /> Identité vérifiée par Gilli</li>}
    </ul>
  )
}

const ratingLabels = ['', 'Très mauvais', 'Mauvais', 'Correct', 'Bien', 'Excellent']

function ReviewDialog({ sellerName, current, onClose, onSave, onDelete }: { sellerName: string; current: MyReview | null; onClose: () => void; onSave: (rating: number, comment: string) => Promise<void>; onDelete: () => Promise<void> }) {
  const [rating, setRating] = useState(current?.rating ?? 0)
  const [comment, setComment] = useState(current?.comment ?? '')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!rating) {
      setError('Choisissez une note de 1 à 5 étoiles.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await onSave(rating, comment.trim())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'L’avis n’a pas pu être enregistré.')
      setIsSaving(false)
    }
  }
  return (
    <Modal title={current ? 'Modifier mon avis' : 'Donner mon avis'} onClose={onClose} className="business-dialog">
      <form onSubmit={(event) => void submit(event)}>
        <p className="field-hint">Votre avis sur {sellerName} aide les autres clients. Il est publié sans votre nom ni votre adresse e-mail.</p>
        <fieldset className="star-picker">
          <legend className="field-label">Note</legend>
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className={value <= rating ? 'is-on' : ''}>
              <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} />
              <Star size={30} aria-hidden="true" fill={value <= rating ? 'currentColor' : 'none'} />
              <span className="visually-hidden">{value} étoile{value > 1 ? 's' : ''} : {ratingLabels[value]}</span>
            </label>
          ))}
          <span className="star-picker-label" aria-hidden="true">{ratingLabels[rating]}</span>
        </fieldset>
        <label className="field">
          <span className="field-label">Commentaire (facultatif)</span>
          <textarea rows={4} maxLength={500} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Accueil, conformité du produit, délai…" />
        </label>
        <p className="field-hint">Pas de numéro de téléphone, de lien ni d’insulte : ces avis sont vérifiés par l’équipe avant publication.</p>
        {error && <p className="message-error" role="alert">{error}</p>}
        <button type="submit" className="primary-button is-block" disabled={isSaving}>Publier mon avis</button>
        {current && <button type="button" className="text-button danger-text is-block" disabled={isSaving} onClick={() => void onDelete()}>Supprimer mon avis</button>}
      </form>
    </Modal>
  )
}

/** Avis des clients sur la page du vendeur, et l’avis du compte connecté (donner, modifier, supprimer). */
export function ReviewsSection({ sellerId, sellerName, reviews, account, onNotify, onChanged }: {
  sellerId: string
  sellerName: string
  reviews: SellerReview[]
  account?: MarketAccount
  onNotify: Notify
  onChanged: () => void
}) {
  const [mine, setMine] = useState<MyReview | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const api = account?.signedIn ? account.savedApi : null
  useEffect(() => {
    let cancelled = false
    setMine(null)
    if (api) void api.myReview(sellerId).then((review) => { if (!cancelled) setMine(review) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [api, sellerId])

  const open = () => {
    if (!api) {
      account?.onSignIn()
      return
    }
    setIsOpen(true)
  }
  return (
    <section className="seller-reviews" aria-labelledby="seller-reviews-title">
      <div className="seller-reviews-head">
        <h2 id="seller-reviews-title">Avis des clients</h2>
        {account && <button type="button" className="secondary-button" onClick={open}>{mine ? 'Modifier mon avis' : 'Donner mon avis'}</button>}
      </div>
      {mine && mine.status !== 'published' && <p className="field-hint">Votre avis sera visible après vérification par l’équipe Gilli.</p>}
      {reviews.length === 0 ? (
        <p className="field-hint">Aucun avis pour l’instant.</p>
      ) : (
        <ul className="review-list" aria-label="Avis">
          {reviews.map((review) => (
            <li key={review.id} className="review">
              <div className="review-head"><Stars rating={review.rating} /> <span className="review-date">{new Date(review.updatedAt).toLocaleDateString('fr', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
              {review.comment && <p>{review.comment}</p>}
              <span className="review-author">Client Gilli</span>
            </li>
          ))}
        </ul>
      )}
      {isOpen && api && (
        <ReviewDialog
          sellerName={sellerName}
          current={mine}
          onClose={() => setIsOpen(false)}
          onSave={async (rating, comment) => {
            const saved = await api.saveReview(sellerId, { rating, comment })
            setMine(saved)
            setIsOpen(false)
            onNotify(saved.status === 'published' ? 'Merci : votre avis est publié.' : 'Merci : votre avis sera publié après vérification.', 'success')
            onChanged()
          }}
          onDelete={async () => {
            await api.deleteReview(sellerId)
            setMine(null)
            setIsOpen(false)
            onNotify('Votre avis a été supprimé.', 'success')
            onChanged()
          }}
        />
      )}
    </section>
  )
}

/**
 * Note moyenne et répartition des notes (5 à 1 étoiles). La moyenne vient de Gilli (tous les avis
 * publiés) ; la répartition est calculée sur les avis affichés.
 */
export function RatingSummary({ stats, reviews }: { stats?: SellerStats; reviews: SellerReview[] }) {
  if (!stats || stats.rating === null || stats.reviewCount === 0) return null
  const counts = [5, 4, 3, 2, 1].map((value) => ({ value, count: reviews.filter((review) => review.rating === value).length }))
  const total = Math.max(reviews.length, 1)
  return (
    <div className="rating-summary">
      <div className="rating-summary-score">
        <strong>{formatRating(stats.rating)}</strong>
        <Stars rating={stats.rating} size={16} />
        <span>{stats.reviewCount} avis</span>
      </div>
      <ul className="rating-bars" aria-label="Répartition des notes">
        {counts.map(({ value, count }) => (
          <li key={value}>
            <span>{value} <Star size={11} aria-hidden="true" fill="currentColor" /></span>
            <span className="rating-bar" aria-hidden="true"><span style={{ width: `${Math.round((count / total) * 100)}%` }} /></span>
            <span className="rating-bar-count">{count}</span>
            <span className="visually-hidden">{value} étoile{value > 1 ? 's' : ''} : {count} avis</span>
          </li>
        ))}
      </ul>
      {reviews.length < stats.reviewCount && <p className="field-hint">Répartition calculée sur les {reviews.length} avis les plus récents.</p>}
    </div>
  )
}
