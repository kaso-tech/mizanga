interface AboutViewProps {
  engineLabel: string
  isDemonstration: boolean
}

export function AboutView({ engineLabel, isDemonstration }: AboutViewProps) {
  return (
    <article className="page-view about-view">
      <div className="weave-band about-band" aria-hidden="true" />
      <h1>À propos de Gilli</h1>
      <p>
        Gilli est une marketplace où des commerçants présentent leurs produits, avec un assistant d’achat : vous dites ce
        que vous cherchez et votre budget, il trouve les annonces qui correspondent, les compare et vous met en contact
        avec le vendeur (WhatsApp ou appel).
      </p>
      <p>Gilli est lancé au Burkina Faso, avant d’autres pays de la zone UEMOA.</p>
      <section className="settings-section">
        <h2>Nos engagements</h2>
        <ul>
          <li>L’assistant ne recommande que des produits réellement publiés sur Gilli : il n’invente ni produit, ni prix, ni caractéristique.</li>
          <li>Seuls des commerçants, avec leur vitrine, peuvent vendre sur Gilli.</li>
          <li>Chaque annonce est vérifiée avant d’être visible ; vous pouvez signaler une annonce depuis sa page.</li>
          <li>Le paiement et la livraison se règlent directement avec le vendeur : voyez le produit avant de payer.</li>
          {isDemonstration
            ? <li>Interface en version de démonstration : aucun moteur d’IA n’est connecté.</li>
            : <li>Les réponses de l’assistant sont produites par {engineLabel} ; elles peuvent contenir des erreurs.</li>}
        </ul>
      </section>
      <p className="about-version">Version {__BUILD_INFO__.version} · {__BUILD_INFO__.commit} · {new Date(__BUILD_INFO__.builtAt).toLocaleDateString('fr', { dateStyle: 'medium' })}</p>
    </article>
  )
}
