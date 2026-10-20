import { Globe2, Languages, ShieldCheck, Sparkles } from 'lucide-react'

export function AboutView() {
  return (
    <section className="about-view page-view">
      <div className="page-heading">
        <p className="eyebrow">À propos de Mizanga</p>
        <h1>Un assistant IA qui vous comprend, dans votre langue.</h1>
        <p>Mizanga est un assistant généraliste : il aide à écrire, résumer, expliquer, apprendre ou s’organiser, comme les autres assistants IA. Sa différence : il est conçu pour comprendre et répondre en mooré, une langue encore mal prise en charge par la plupart des outils.</p>
      </div>
      <div className="principle-grid">
        <article><span><Sparkles size={20} /></span><h2>Toutes les tâches du quotidien</h2><p>Courriers, résumés, explications, devoirs, organisation : Mizanga vise la même polyvalence que les grands assistants.</p></article>
        <article><span><Languages size={20} /></span><h2>Le mooré en langue de travail</h2><p>Écrivez en français ou en mooré ; Mizanga répond dans votre langue, ou dans celle que vous choisissez.</p></article>
        <article><span><ShieldCheck size={20} /></span><h2>Transparence</h2><p>L’application indique ce qui est connecté, démontré ou encore en préparation, et ne fabrique ni sources ni réponses.</p></article>
        <article><span><Globe2 size={20} /></span><h2>Qualité vérifiée</h2><p>Les corrections proposées par les locuteurs seront relues avant d’améliorer les réponses en mooré. D’autres langues du Burkina Faso pourront suivre.</p></article>
      </div>
      <section className="roadmap-card"><p className="eyebrow">Prochaine étape</p><h2>Connecter le moteur</h2><p>Les points d’intégration sont prêts pour le moteur IA, la recherche web avec sources, les comptes et la validation des corrections en mooré. Aucun de ces services n’est encore actif dans cette version.</p></section>
    </section>
  )
}
