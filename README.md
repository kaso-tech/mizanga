# Mizanga

Mizanga est un **assistant IA généraliste** — rédiger, résumer, expliquer, apprendre, s’organiser — dont la particularité est de **comprendre et de répondre en mooré**, une langue encore mal prise en charge par les autres assistants. D’autres langues du Burkina Faso (fulfulde, dioula/bambara) pourront suivre.

> **État actuel : démonstration.** Aucun moteur d’IA n’est encore connecté. L’interface est complète et utilisable, mais chaque réponse est un message de démonstration qui l’indique explicitement. Aucune réponse, source ou phrase en mooré n’est inventée.

## Fonctionnalités

- Conversation avec réponse progressive, arrêt et régénération ; réponses en Markdown (tableaux, code, liens).
- Langue des réponses : automatique (même langue que l’utilisateur), mooré standardisé ou informel, français, anglais.
- Clavier des caractères du mooré (ɛ ɩ ʋ ã ẽ ĩ õ ũ Ɛ Ɩ Ʋ) inséré au curseur ; le texte saisi n’est jamais normalisé.
- Historique de la session avec recherche, favoris et suppression (en mémoire uniquement).
- Avis sur les réponses et signalement d’erreurs en mooré (préparés localement, pas encore envoyés).
- Paramètres : thème clair, sombre ou système, langue et écriture, données, voix et compte (ces deux dernières sections arrivent bientôt).
- Accessible au clavier et aux lecteurs d’écran, utilisable sur téléphone, tablette et ordinateur.

## Démarrer

Prérequis : Node.js 22 et pnpm (la version attendue est fixée dans `package.json`, champ `packageManager` ; `corepack enable` l’installe automatiquement).

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

| Commande | Rôle |
| --- | --- |
| `pnpm dev` | Serveur de développement (port 3000) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Vérification TypeScript |
| `pnpm test` | Tests Vitest (une fois) ; `pnpm test:watch` pour le mode continu |
| `pnpm build` | Vérification des types puis build de production dans `dist/` |
| `pnpm preview` | Sert le build de production localement |

La CI GitHub Actions (`.github/workflows/ci.yml`) exécute lint, types, tests et build sur chaque pull request et sur `main`.

## Pile technique

React 18, TypeScript, Vite ; CSS sans framework (jetons dans `src/styles/global.css`) ; polices Noto Sans et Noto Serif embarquées via `@fontsource` pour un rendu identique des lettres du mooré ; `react-markdown` + `remark-gfm` pour les réponses ; Vitest et Testing Library pour les tests.

## Structure

```text
src/
  app/          App (routes, préférences, notifications) et hook useConversation
  components/   Barre latérale, en-tête, conversation, zone de saisie, paramètres…
  data/         Libellés, suggestions et caractères du mooré
  domain/       Types et contrats des services (IA, recherche, stockage, voix, administration)
  services/     Adaptateur de démonstration du moteur d’IA
  styles/       Feuille de style unique et jetons de design
  test/         Configuration des tests
public/         Favicon et manifeste des routes (manus-routes.json)
plan.md         Décisions produit et design
```

## Brancher un vrai moteur d’IA

Le moteur est injecté dans `App` et doit respecter le contrat `AiService` de `src/domain/services.ts` :

```ts
interface AiService {
  readonly isDemonstration: boolean
  generate(request: AiGenerationRequest, options: { signal: AbortSignal }): AsyncIterable<AiChunk>
}
```

- `generate` reçoit tout l’historique (texte d’origine, jamais modifié) et les préférences, et renvoie la réponse par fragments ; il doit s’arrêter avec une `AbortError` quand `signal` est annulé (bouton « Arrêter »).
- Chaque fragment peut préciser sa langue (`fr`, `mos`…) seulement si elle est réellement connue.
- Les clés d’API ne doivent jamais se trouver dans le navigateur : un vrai service passera par un serveur.

`src/services/demoAiService.ts` sert d’exemple ; remplacez-le dans `src/main.tsx` (`<App aiService={monService} />`).

## Routes

`/` (conversation), `/parametres`, `/a-propos`, `/historique`, `/favoris`. L’application est une SPA : en production, toute adresse inconnue doit renvoyer `index.html`.

## Déploiement

- **Développement :** environnement Manus, avec le serveur Vite (`pnpm dev`).
- **Production (prévue sur Render) :** site statique, à configurer le moment venu avec un `render.yaml` comprenant la commande `pnpm install --frozen-lockfile && pnpm build`, le dossier `dist` et une règle de réécriture `/*` → `/index.html`.

## Principes du projet

- **Honnêteté :** l’interface indique toujours ce qui est connecté, démontré ou à venir.
- **Respect du texte :** aucune substitution automatique de caractères (par ex. è → ɛ).
- **Qualité du mooré :** les textes en mooré sont rédigés et validés par des locuteurs ; les corrections des utilisateurs seront relues avant toute utilisation.
- **Confidentialité :** aucune donnée n’est envoyée à un serveur dans cette version ; les préférences restent sur l’appareil.
