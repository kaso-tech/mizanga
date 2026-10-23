import { AlertTriangle, Lock, LockOpen, Pencil, Plus, Sprout } from 'lucide-react'
import { formatArea, formatKg, seasonLabels, tenureLabels } from '../../app/agriculture'
import { formatDay } from '../../app/livestock'
import type { Crop, FarmTask, Plot } from '../../services/agricultureApi'

/** Parcelles et leurs cultures : surface, saison, stock de récolte, travaux en retard. */
export function FieldsPanel({ plots, crops, tasks, today, showArchived, onShowArchived, onNewPlot, onEditPlot, onNewCrop, onNewOperation, onToggleCrop }: {
  plots: Plot[]
  crops: Crop[]
  tasks: FarmTask[]
  today: string
  showArchived: boolean
  onShowArchived: (show: boolean) => void
  onNewPlot: () => void
  onEditPlot: (plot: Plot) => void
  onNewCrop: (plot: Plot) => void
  onNewOperation: (crop: Crop) => void
  onToggleCrop: (crop: Crop) => void
}) {
  const activePlots = plots.filter((plot) => !plot.archived)
  const activeCrops = crops.filter((crop) => crop.status === 'active')
  const late = tasks.filter((task) => task.status === 'planned' && task.dueOn < today)
  const stock = crops.reduce((total, crop) => total + crop.stockKg, 0)

  return (
    <section aria-label="Parcelles" className="business-panel">
      <div className="admin-stats business-stats">
        <div className="admin-stat"><span className="admin-stat-value">{activePlots.length}</span><span className="admin-stat-label">Parcelles ({formatArea(activePlots.reduce((total, plot) => total + plot.areaM2, 0), 'ha')})</span></div>
        <div className="admin-stat"><span className="admin-stat-value">{activeCrops.length}</span><span className="admin-stat-label">Cultures en cours</span></div>
        <div className="admin-stat"><span className="admin-stat-value">{formatKg(Math.round(stock * 1000) / 1000)}</span><span className="admin-stat-label">Récolte en stock</span></div>
        <div className={`admin-stat ${late.length ? 'is-warning' : ''}`}><span className="admin-stat-value">{late.length}</span><span className="admin-stat-label">Travaux en retard</span></div>
      </div>
      <div className="business-toolbar">
        <label className="checkbox-field"><input type="checkbox" checked={showArchived} onChange={(event) => onShowArchived(event.target.checked)} /> Parcelles archivées</label>
        <button type="button" className="primary-button" onClick={onNewPlot}><Plus size={16} aria-hidden="true" /> Nouvelle parcelle</button>
      </div>
      {plots.length === 0 ? (
        <div className="settings-section business-empty">
          <Sprout size={28} aria-hidden="true" />
          <p>Ajoutez votre première parcelle (nom, surface), puis ses cultures de la saison.</p>
        </div>
      ) : (
        <ul className="product-list" aria-label="Parcelles">
          {plots.map((plot) => {
            const plotCrops = crops.filter((crop) => crop.plotId === plot.id)
            return (
              <li key={plot.id} className={`product-card plot-card ${plot.archived ? 'is-archived' : ''}`}>
                <div className="product-main">
                  <span className="product-name">{plot.name}</span>
                  <span className="listing-badge">{formatArea(plot.areaM2, plot.areaUnit)}</span>
                  {plot.archived && <span className="listing-badge is-withdrawn">Archivée</span>}
                </div>
                <div className="product-figures">
                  {plot.location && <span>{plot.location}</span>}
                  <span>{tenureLabels[plot.tenure]}</span>
                </div>
                {plotCrops.length > 0 && (
                  <ul className="crop-list" aria-label={`Cultures de ${plot.name}`}>
                    {plotCrops.map((crop) => {
                      const cropLate = late.filter((task) => task.cropId === crop.id).length
                      return (
                        <li key={crop.id} className={`crop-row ${crop.status === 'closed' ? 'is-closed' : ''}`}>
                          <div className="crop-main">
                            <strong>{crop.cropLabel}</strong>
                            <span>{seasonLabels[crop.season]} {crop.year} · {formatArea(crop.areaM2, plot.areaUnit)}</span>
                            {crop.status === 'closed' && <span className="listing-badge is-withdrawn">Clôturée</span>}
                            {cropLate > 0 && <span className="stock-badge is-low"><AlertTriangle size={12} aria-hidden="true" /> {cropLate} travail{cropLate > 1 ? 'x' : ''} en retard</span>}
                          </div>
                          <div className="crop-figures">
                            {crop.sownOn && <span>Semée le {formatDay(crop.sownOn)}</span>}
                            {crop.expectedHarvestOn && <span>Récolte prévue le {formatDay(crop.expectedHarvestOn)}</span>}
                            <span>Récolté : {formatKg(crop.harvestedKg)} · en stock : {formatKg(crop.stockKg)}</span>
                          </div>
                          <div className="product-actions">
                            <button type="button" className="secondary-button" onClick={() => onNewOperation(crop)} aria-label={`Opération pour ${crop.cropLabel} (${plot.name})`}><Plus size={14} aria-hidden="true" /> Opération</button>
                            <button type="button" className="icon-button" onClick={() => onToggleCrop(crop)} aria-label={crop.status === 'active' ? `Clôturer ${crop.cropLabel} (${plot.name})` : `Rouvrir ${crop.cropLabel} (${plot.name})`} title={crop.status === 'active' ? 'Clôturer la culture' : 'Rouvrir la culture'}>
                              {crop.status === 'active' ? <Lock size={16} /> : <LockOpen size={16} />}
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <div className="product-actions">
                  {!plot.archived && <button type="button" className="secondary-button" onClick={() => onNewCrop(plot)} aria-label={`Nouvelle culture sur ${plot.name}`}><Sprout size={14} aria-hidden="true" /> Culture</button>}
                  <button type="button" className="icon-button" onClick={() => onEditPlot(plot)} aria-label={`Modifier ${plot.name}`} title="Modifier"><Pencil size={16} /></button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
