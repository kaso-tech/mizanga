import { AlertTriangle, Pencil, Plus, Rows3 } from 'lucide-react'
import { sexLabels, speciesLabels } from '../../app/livestock'
import type { Animal, HealthRecord, Herd } from '../../services/livestockApi'

/** Lots et troupeaux : effectif, espèce, animaux suivis un par un, rappels de soins en retard. */
export function HerdsPanel({ herds, animals, health, today, showArchived, onShowArchived, onNewHerd, onNewEvent, onEditHerd }: {
  herds: Herd[]
  animals: Animal[]
  health: HealthRecord[]
  today: string
  showArchived: boolean
  onShowArchived: (show: boolean) => void
  onNewHerd: () => void
  onNewEvent: (herd: Herd) => void
  onEditHerd: (herd: Herd) => void
}) {
  const active = herds.filter((herd) => !herd.archived)
  const total = active.reduce((sum, herd) => sum + herd.headcount, 0)
  const overdue = health.filter((record) => record.status === 'planned' && record.dueOn !== null && record.dueOn < today)

  return (
    <section aria-label="Lots" className="business-panel">
      <div className="admin-stats business-stats">
        <div className="admin-stat"><span className="admin-stat-value">{active.length}</span><span className="admin-stat-label">Lots actifs</span></div>
        <div className="admin-stat"><span className="admin-stat-value">{total.toLocaleString('fr')}</span><span className="admin-stat-label">Animaux</span></div>
        <div className={`admin-stat ${overdue.length ? 'is-warning' : ''}`}><span className="admin-stat-value">{overdue.length}</span><span className="admin-stat-label">Soins en retard</span></div>
      </div>
      <div className="business-toolbar">
        <label className="checkbox-field"><input type="checkbox" checked={showArchived} onChange={(event) => onShowArchived(event.target.checked)} /> Lots archivés</label>
        <button type="button" className="primary-button" onClick={onNewHerd}><Plus size={16} aria-hidden="true" /> Nouveau lot</button>
      </div>
      {herds.length === 0 ? (
        <div className="settings-section business-empty">
          <Rows3 size={28} aria-hidden="true" />
          <p>Créez votre premier lot ou troupeau : espèce, nombre d’animaux au départ (ou un suivi animal par animal pour les bovins).</p>
        </div>
      ) : (
        <ul className="product-list" aria-label="Lots">
          {herds.map((herd) => {
            const herdAnimals = animals.filter((animal) => animal.herdId === herd.id && animal.status === 'present')
            const late = overdue.filter((record) => record.herdId === herd.id).length
            return (
              <li key={herd.id} className={`product-card herd-card ${herd.archived ? 'is-archived' : ''}`}>
                <div className="product-main">
                  <span className="product-name">{herd.name}</span>
                  <span className="listing-badge">{speciesLabels[herd.species]}</span>
                  {herd.archived && <span className="listing-badge is-withdrawn">Archivé</span>}
                  {late > 0 && <span className="stock-badge is-low"><AlertTriangle size={12} aria-hidden="true" /> {late} soin{late > 1 ? 's' : ''} en retard</span>}
                </div>
                <div className="product-figures">
                  <span><strong>{herd.headcount.toLocaleString('fr')}</strong> {herd.headcount > 1 ? 'animaux' : 'animal'}</span>
                  <span>{herd.tracking === 'individual' ? 'Suivi un par un' : 'Suivi en lot'}</span>
                  <span>Depuis le {new Date(`${herd.startedOn}T12:00:00Z`).toLocaleDateString('fr', { timeZone: 'UTC', dateStyle: 'medium' })}</span>
                </div>
                {herd.tracking === 'individual' && herdAnimals.length > 0 && (
                  <details className="herd-animals">
                    <summary>Animaux ({herdAnimals.length})</summary>
                    <ul>{herdAnimals.map((animal) => <li key={animal.id}><strong>{animal.tag}</strong>{animal.name ? ` · ${animal.name}` : ''} · {sexLabels[animal.sex]}</li>)}</ul>
                  </details>
                )}
                {!herd.archived && (
                  <div className="product-actions">
                    <button type="button" className="secondary-button" onClick={() => onNewEvent(herd)} aria-label={`Événement pour ${herd.name}`}><Plus size={14} aria-hidden="true" /> Événement</button>
                    <button type="button" className="icon-button" onClick={() => onEditHerd(herd)} aria-label={`Modifier ${herd.name}`} title="Modifier"><Pencil size={16} /></button>
                  </div>
                )}
                {herd.archived && (
                  <div className="product-actions">
                    <button type="button" className="icon-button" onClick={() => onEditHerd(herd)} aria-label={`Modifier ${herd.name}`} title="Modifier"><Pencil size={16} /></button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
