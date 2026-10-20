export function AboutView() {
  return (
    <article className="page-view about-view">
      <div className="weave-band about-band" aria-hidden="true" />
      <h1>À propos du projet</h1>
      <p>
        Mizanga est un assistant d’intelligence artificielle généraliste, comme ChatGPT, Claude ou Perplexity : il rédige,
        résume, explique, analyse et aide à accomplir toutes sortes de tâches. Sa particularité : il sait discuter et
        répondre correctement en mooré, une langue encore mal comprise par la plupart des IA.
      </p>
      <p>D’autres langues, comme le fulfulde et le dioula/bambara, pourront être ajoutées par la suite.</p>
      <section className="settings-section">
        <h2>État actuel</h2>
        <ul>
          <li>Interface en version de démonstration.</li>
          <li>Aucun moteur d’IA n’est encore connecté : la maîtrise du mooré n’a pas encore été évaluée.</li>
          <li>Aucune source ni traduction n’est inventée.</li>
          <li>Les corrections proposées par les utilisateurs seront vérifiées avant d’être utilisées.</li>
        </ul>
      </section>
    </article>
  )
}
