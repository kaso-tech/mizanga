import { BookOpenCheck, Database, HandHeart, ShieldAlert } from 'lucide-react'

export function AboutView() {
  return (
    <section className="about-view page-view">
      <div className="page-heading"><p className="eyebrow">À propos du projet</p><h1>Faire grandir le numérique<br />avec le <em>Mooré.</em></h1><p>Mooré AI prépare un accès plus naturel à l’information, à l’apprentissage et aux expressions culturelles dans la langue Mooré.</p></div>
      <div className="principle-grid">
        <article><span><HandHeart size={20} /></span><h2>Rigueur linguistique</h2><p>Les retours et les variantes ne seront jamais considérés comme validés sans vérification.</p></article>
        <article><span><ShieldAlert size={20} /></span><h2>Transparence</h2><p>L’application indique ce qui est connecté, démontré ou encore en préparation.</p></article>
        <article><span><BookOpenCheck size={20} /></span><h2>Savoirs sourcés</h2><p>Les futures sources seront distinguées clairement des explications générées.</p></article>
        <article><span><Database size={20} /></span><h2>Évolution maîtrisée</h2><p>Conversations, dictionnaire, proverbes et données vocales seront ajoutés progressivement.</p></article>
      </div>
      <section className="roadmap-card"><p className="eyebrow">Prochaine phase</p><h2>Connecter sans précipiter</h2><p>Les points d’intégration sont préparés pour l’authentification, la recherche documentaire, le moteur IA et un espace de validation linguistique. Aucun de ces services n’est actif dans cette version.</p></section>
    </section>
  )
}
