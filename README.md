# Mizanga

Mizanga est un **assistant IA généraliste** — rédiger, résumer, expliquer, apprendre, s’organiser — dont la particularité est de **comprendre et de répondre en mooré**, une langue encore mal prise en charge par les autres assistants. D’autres langues du Burkina Faso (fulfulde, dioula/bambara) pourront suivre.

> **Moteur : Gemini (Google), offre gratuite.** Quand une clé `GEMINI_API_KEY` est configurée sur le serveur, les réponses sont produites par Gemini. Sans clé, l’application reste en **mode démonstration** et le dit explicitement. La maîtrise du mooré par Gemini n’a pas encore été évaluée par des locuteurs.

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
cp .env.example .env.local   # puis renseignez GEMINI_API_KEY (facultatif)
pnpm dev                     # http://localhost:3000
```

Sans clé, tout fonctionne en mode démonstration. Une clé gratuite se crée sur [Google AI Studio](https://aistudio.google.com/apikey). La clé peut aussi être fournie en variable d’environnement (secrets de l’environnement Manus, de Render…) ; elle n’est jamais envoyée au navigateur.

| Commande | Rôle |
| --- | --- |
| `pnpm dev` | Serveur de développement (port 3000) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | Vérification TypeScript |
| `pnpm test` | Tests Vitest (une fois) ; `pnpm test:watch` pour le mode continu |
| `pnpm build` | Vérification des types puis build de production dans `dist/` |
| `pnpm preview` | Sert le build de production localement (avec l’API) |
| `pnpm start` | Serveur de production : site compilé + API (après `pnpm build`) |

La CI GitHub Actions (`.github/workflows/ci.yml`) exécute lint, types, tests et build sur chaque pull request et sur `main`.

## Pile technique

React 18, TypeScript, Vite ; CSS sans framework (jetons dans `src/styles/global.css`) ; polices Noto Sans et Noto Serif embarquées via `@fontsource` pour un rendu identique des lettres du mooré ; `react-markdown` + `remark-gfm` pour les réponses ; Vitest et Testing Library pour les tests.

## Structure

```text
server/         Relais vers Gemini (/api/chat, /api/health) et serveur de production
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

## Moteur d’IA

```text
Navigateur ──/api/chat──▶ serveur Mizanga (server/) ──▶ API Gemini
            ◀─ NDJSON ──                            ◀─ SSE ──
```

- **Côté serveur** (`server/chat-handler.mjs`, `server/gemini.mjs`) : le relais ajoute les consignes de Mizanga (assistant généraliste, langue de réponse choisie, honnêteté sur le mooré), transmet l’historique tel quel à Gemini et renvoie la réponse fragment par fragment. Le même code tourne dans `pnpm dev` (extension Vite), `pnpm preview` et `pnpm start`.
- **Garde-fous** : taille des demandes limitée, 20 demandes par minute et par visiteur, annulation propagée quand l’utilisateur clique sur « Arrêter », erreurs traduites en messages clairs (quota gratuit atteint, clé refusée…).
- **Côté navigateur** : au démarrage, l’application interroge `/api/health` et choisit le moteur Gemini (`src/services/remoteAiService.ts`) ou la démonstration (`src/services/demoAiService.ts`).

| Variable | Rôle |
| --- | --- |
| `GEMINI_API_KEY` | Clé de l’API Gemini. Absente : mode démonstration. |
| `GEMINI_MODEL` | Modèle utilisé (défaut : `gemini-flash-latest`, alias du Flash le plus récent). |
| `PORT` | Port du serveur de production (défaut : 3000). |

**Confidentialité :** avec l’offre gratuite de Gemini, Google peut utiliser les échanges pour améliorer ses services ; l’application le signale dans les paramètres. Passez à une offre payante avant d’accueillir des données sensibles.

Pour changer de fournisseur, il suffit d’un autre `AiService` (contrat dans `src/domain/services.ts`) ou d’un autre relais côté serveur.

## Routes

`/` (conversation), `/parametres`, `/a-propos`, `/historique`, `/favoris`. L’application est une SPA : en production, toute adresse inconnue doit renvoyer `index.html`.

## Déploiement

- **Développement :** environnement Manus, avec `pnpm dev` ; la clé se configure dans les secrets de l’environnement (`GEMINI_API_KEY`).
- **Production (prévue sur Render) :** un **Web Service** Node (et non un site statique, puisque l’API doit tourner côté serveur) :
  - Build : `corepack enable && pnpm install --frozen-lockfile && pnpm build`
  - Start : `pnpm start`
  - Variables : `GEMINI_API_KEY` (et éventuellement `GEMINI_MODEL`) ; Render fournit `PORT`.

  Le serveur sert aussi les routes de l’application (`/parametres`…) et met en cache les fichiers de `dist/assets`.

## Principes du projet

- **Honnêteté :** l’interface indique toujours ce qui est connecté, démontré ou à venir.
- **Respect du texte :** aucune substitution automatique de caractères (par ex. è → ɛ).
- **Qualité du mooré :** les textes en mooré sont rédigés et validés par des locuteurs ; les corrections des utilisateurs seront relues avant toute utilisation.
- **Confidentialité :** les conversations ne sont pas stockées par Mizanga (elles restent en mémoire dans le navigateur) et les préférences restent sur l’appareil ; en mode Gemini, les messages transitent par Google pour produire les réponses.
