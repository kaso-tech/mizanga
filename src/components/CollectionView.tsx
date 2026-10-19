import { Bookmark, Clock3, Search } from 'lucide-react'

interface CollectionViewProps {
  kind: 'history' | 'favorites'
}

export function CollectionView({ kind }: CollectionViewProps) {
  const isHistory = kind === 'history'
  const Icon = isHistory ? Clock3 : Bookmark
  const title = isHistory ? 'Historique des conversations' : 'Favoris de démonstration'

  return (
    <section className="collection-view page-view">
      <div className="page-heading"><p className="eyebrow">{isHistory ? 'Vos échanges' : 'Vos repères'}</p><h1>{title}</h1><p>Cette première version ne conserve pas les conversations entre les sessions.</p></div>
      {isHistory && <label className="history-search"><Search size={18} /><input disabled placeholder="Rechercher dans l’historique — bientôt disponible" /></label>}
      <div className="empty-collection"><span><Icon size={25} /></span><h2>{isHistory ? 'Aucun historique enregistré' : 'Aucun favori enregistré'}</h2><p>La persistance, la recherche et l’enregistrement de favoris seront ajoutés avec l’authentification et un stockage sécurisé.</p><small>État de démonstration — aucune donnée n’est actuellement sauvegardée.</small></div>
    </section>
  )
}
