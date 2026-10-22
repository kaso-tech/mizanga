# Gilli

Gilli est un **assistant IA généraliste** — rédiger, résumer, expliquer, apprendre, s’organiser — dont la particularité est de **comprendre et de répondre en mooré**, une langue encore mal prise en charge par les autres assistants. D’autres langues du Burkina Faso (fulfulde, dioula/bambara) pourront suivre.

> **Moteur : Gemini (Google), offre gratuite.** Quand une clé `GEMINI_API_KEY` est configurée sur le serveur, les réponses sont produites par Gemini. Sans clé, l’application reste en **mode démonstration** et le dit explicitement. La maîtrise du mooré par Gemini n’a pas encore été évaluée par des locuteurs.

## Fonctionnalités

- Conversation avec réponse progressive, arrêt et régénération (les versions précédentes d’une réponse restent consultables : ‹ 1 / 2 ›) ; réponses en Markdown (tableaux, code, liens) et formules mathématiques (KaTeX, chargé seulement quand une réponse en contient).
- Défilement intelligent : la page suit la réponse sauf si vous remontez lire ; un bouton permet de reprendre le fil.
- Raccourcis : Échap arrête la génération, Ctrl/Cmd + Maj + O ouvre une nouvelle conversation.
- Langue des réponses : automatique (même langue que l’utilisateur), mooré standardisé ou informel, français, anglais.
- Fichiers joints : photos (réduites avant l’envoi pour économiser les données), PDF et fichiers texte, par bouton, glisser-déposer ou collage ; 4 fichiers et 8 Mo au plus par message. Leur contenu n’est pas conservé dans l’historique.
- Recherche web automatique : le moteur cherche sur Google seulement quand la demande le justifie (actualité, faits récents ou à vérifier) ; la réponse cite alors ses sources, accompagnées des suggestions de recherche Google exigées par les conditions de Google.
- Messages vocaux (2 minutes au plus, convertis en WAV 16 kHz) et fichiers audio ; la compréhension du mooré parlé n’est pas encore garantie.
- Conversations renommables, exportables en Markdown, imprimables ou enregistrables en PDF (mise en page dédiée), et réponses partageables (WhatsApp, SMS…) via le partage du téléphone.
- **Instructions personnelles** (Paramètres › Personnalisation) : métier, région, ton ou longueur de réponse préférés, pris en compte dans toutes les conversations (1 500 caractères au plus, placés après les règles de Gilli).
- **Consignes enregistrées** : les demandes fréquentes, enregistrées depuis un message ou dans Paramètres › Personnalisation, proposées sur l’accueil et en tapant « / » au début d’un message.
- **Lecture à voix haute** des réponses avec la synthèse vocale de l’appareil (vitesse et voix réglables, sans envoi de données) ; aucune voix mooré n’existe encore, l’interface le signale.
- **Console d’administration** (`/admin`, réservée à l’équipe, protégée par mot de passe côté serveur et jamais liée depuis l’interface) : configuration du moteur, état de la référence du mooré, et outil d’évaluation du mooré (importer des questions préparées par des locuteurs en CSV, obtenir les réponses une à une, les noter, exporter les résultats pour Excel). L’ancienne adresse `/evaluation` y mène.
- Clavier des caractères du mooré (ɛ ɩ ʋ ã ẽ ĩ õ ũ Ɛ Ɩ Ʋ) inséré au curseur ; le texte saisi n’est jamais normalisé.
- Historique avec recherche dans les titres et le contenu des messages, favoris et suppression, enregistré sur l’appareil (désactivable dans les paramètres, par exemple sur un appareil partagé).
- Sauvegarde de l’historique dans un fichier JSON et restauration sur un autre appareil, sans doublons (Paramètres › Conversations et données).
- Avis sur les réponses et signalement d’erreurs en mooré (préparés localement, pas encore envoyés).
- Paramètres : général (thème, taille du texte, installation), personnalisation, langue et écriture, données, voix, et compte (à venir).
- Accessible au clavier et aux lecteurs d’écran, utilisable sur téléphone, tablette et ordinateur.
- Installable comme une application (PWA) sur Android, iPhone et ordinateur ; l’interface et l’historique s’ouvrent hors connexion (les réponses du moteur demandent le réseau). Hors connexion, un message peut être mis en attente : il part automatiquement au retour du réseau.
- Deux modèles au choix : standard ou économe (plus rapide, quota gratuit distinct et plus large). Quand le quota du modèle standard est épuisé, un bouton propose de réessayer avec le modèle économe. Les titres de conversation passent par le modèle économe pour préserver le quota principal.

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
| `pnpm test:e2e` | Après `pnpm build` : parcours sur téléphone Android émulé (Playwright, Chromium) |
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
  data/         Libellés et caractères du mooré
  domain/       Types et contrats des services (IA, recherche, stockage, voix, administration)
  services/     Adaptateurs de démonstration et de relais du moteur d’IA
  styles/       Feuille de style unique et jetons de design
  test/         Configuration des tests
public/         Favicon et manifeste des routes (manus-routes.json)
plan.md         Décisions produit et design
```

## Moteur d’IA

```text
Navigateur ──/api/chat──▶ serveur Gilli (server/) ──▶ API Gemini
            ◀─ NDJSON ──                            ◀─ SSE ──
```

- **Service IA centralisé** (`server/ai/`) : toutes les demandes au modèle passent par le contrat `server/ai/provider.mjs` ; l’implémentation Gemini est dans `server/ai/gemini.mjs`, les consignes communes dans `server/ai/system-instruction.mjs`. Le fournisseur se choisit côté serveur (`AI_PROVIDER`, seule valeur actuelle : `gemini`) ; en ajouter un autre (Qwen…) ne touche pas au reste. Des instantanés (`server/preservation.test.mjs`) figent les requêtes envoyées au moteur pour garantir qu’une réorganisation ne change pas le comportement.
- **Côté serveur** (`server/chat-handler.mjs`) : le relais ajoute les consignes de Gilli (assistant généraliste, langue de réponse choisie, honnêteté sur le mooré), transmet l’historique tel quel à Gemini et renvoie la réponse fragment par fragment. Le même code tourne dans `pnpm dev` (extension Vite), `pnpm preview` et `pnpm start`.
- **Garde-fous** : taille des demandes limitée, 20 demandes par minute et par origine de connexion observée par le serveur (sans faire confiance à l’en-tête falsifiable `X-Forwarded-For`), annulation propagée quand l’utilisateur clique sur « Arrêter », erreurs traduites en messages clairs (quota gratuit atteint, clé refusée…).
- **Côté navigateur** : au démarrage, l’application interroge `/api/health` et choisit le moteur Gemini (`src/services/remoteAiService.ts`) ou la démonstration (`src/services/demoAiService.ts`).

| Variable | Rôle |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Comptes (Supabase Auth) : adresse du projet et clé **publique**. Une clé secrète (service_role) est refusée au démarrage. Absentes : pas de comptes. |
| `AI_PROVIDER` | Fournisseur d’IA (défaut : `gemini`). Une valeur inconnue empêche le démarrage. |
| `GEMINI_API_KEY` | Clé de l’API Gemini. Absente : mode démonstration. |
| `GEMINI_MODEL` | Modèle standard (défaut : `gemini-flash-latest`, alias du Flash le plus récent). |
| `GEMINI_LITE_MODEL` | Modèle économe, proposé au choix et utilisé pour les titres (défaut : `gemini-flash-lite-latest`). |
| `ADMIN_PASSWORD` | Mot de passe de la console d’administration (12 caractères au moins). Absent : console fermée. |
| `PORT` | Port du serveur de production (défaut : 3000). |

**Confidentialité :** avec l’offre gratuite de Gemini, Google peut utiliser les échanges pour améliorer ses services ; l’application le signale dans les paramètres. Passez à une offre payante avant d’accueillir des données sensibles.

Pour changer de fournisseur, il suffit d’un autre `AiService` (contrat dans `src/domain/services.ts`) ou d’un autre relais côté serveur.

## Référence du mooré

Le dossier `server/knowledge/moore/` contient la référence que le relais transmet au moteur avec chaque demande : une fiche de règles (`fiche.md`), des exemples de réponses (`exemples.csv`) et un lexique (`lexique.csv`). Les fichiers sont livrés **vides** : ils doivent être rédigés et validés par des locuteurs, et seules les lignes au statut `validé` sont envoyées. Le guide pour les linguistes est dans `server/knowledge/moore/LISEZMOI.md`.

- `pnpm moore:check` affiche ce qui sera transmis et signale les problèmes (statut inconnu, ligne validée sans relecteur, doublons, taille dépassée).
- Le serveur relit les fichiers modifiés en quelques secondes ; la référence est limitée à 24 000 caractères par demande.
- La console d’administration (`/admin`) indique ce que contient la référence, la taille envoyée et les problèmes à corriger.

## Base de données (Supabase) — espace Business, en cours

Le schéma est dans `supabase/migrations/` : profils, entreprises et membres (propriétaire ou employé), produits, ventes et lignes de vente (prix d’achat figé au moment de la vente), journal des mouvements de stock, dépenses, consommation de l’IA, formules et abonnements (mode test). Les montants sont des entiers dans la devise de l’entreprise (XOF par défaut).

- **Sécurité :** chaque table a des règles RLS (un commerçant ne voit et ne modifie que les données de ses entreprises) et des droits SQL limités par colonne. La quantité en stock, les ventes et les mouvements ne s’écrivent qu’à travers des fonctions contrôlées ; la consommation IA et les abonnements, que par le serveur.
- **Tests :** `supabase/tests/` applique les migrations à une vraie base PostgreSQL en mémoire (PGlite), avec une simulation de ce que fournit Supabase (rôles, `auth.uid()`, droits par défaut), et vérifie l’isolement entre commerçants. Ils tournent avec `pnpm test` et dans la CI.
- **Comptes :** connexion sans mot de passe par un code reçu par e-mail (Supabase Auth, bibliothèque chargée après l’affichage). Le navigateur se connecte à Supabase avec la clé publique ; le serveur vérifie chaque jeton auprès de Supabase (`/api/me`, base des futures adresses Business). Le chatbot reste utilisable sans compte. Connexion Google : à venir.
- **Espace Business** (`/business`, compte requis) : création du commerce (pays de la zone UEMOA, francs CFA), produits (prix d’achat et de vente, unité, seuil d’alerte, stock initial), mouvements de stock (achat, retour client, perte, inventaire), historique par produit, alertes « Stock bas » et « Rupture », valeur du stock au prix d’achat. La quantité ne change que par les fonctions SQL `create_product` et `record_stock_movement` (journal, stock jamais négatif) ; le serveur (`server/business/`) vérifie le compte et interroge Supabase avec le jeton de l’utilisateur.
- **Ventes, dépenses et résultats :** une vente compte plusieurs produits (prix proposé modifiable) et fait baisser le stock dans la même opération ; le propriétaire peut l’annuler (le stock revient, la vente reste visible). Les dépenses (loyer, transport…) sont datées dans le fuseau du commerce. Les achats de marchandises passent par le stock, pas par les dépenses, pour ne pas compter deux fois le même coût.
- **Calculs (déterministes, faits par la base — fonctions `business_summary` et `business_product_sales`) :** total d’une ligne = quantité × prix, arrondi au franc ; coût d’une ligne = quantité × prix d’achat au moment de la vente ; chiffre d’affaires et coût des produits vendus sur les ventes non annulées ; marge brute = chiffre d’affaires − coût des produits vendus ; résultat estimé = marge brute − dépenses. Les périodes sont des jours du calendrier local du commerce. L’écran rappelle qu’il s’agit d’une estimation, pas d’un résultat comptable ou fiscal certifié.
- **Assistant Business** (onglet Assistant) : questions en langage courant sur le commerce. Le serveur calcule un résumé chiffré avec les droits de l’utilisateur (résultats d’aujourd’hui, des 7 derniers jours, du mois et du mois dernier, ventes par produit, dépenses par catégorie, état du stock) et le transmet au moteur d’IA avec la consigne de n’inventer aucun chiffre ; ni noms de clients, ni notes, ni descriptions, ni identifiants ne sont transmis, et la recherche web est désactivée. Le résumé est montré sous chaque réponse (« Chiffres utilisés par l’assistant »). La conversation n’est pas enregistrée.
- **Assistant de gestion (actions) :** l’assistant peut préparer des fiches de nouveau produit (avec ou sans photo du produit), de mouvement de stock (achat, retour, perte, inventaire), de vente (prix habituel proposé si aucun prix n’est donné), de dépense et d’annulation d’une vente récente (propriétaire seulement ; le modèle reçoit les ventes des 7 derniers jours avec une référence courte, sans noms de clients), grâce aux « fonctions » de Gemini (`server/business/assistant-actions.mjs`). Le modèle ne fait que proposer : la fiche s’affiche dans la conversation, le commerçant la vérifie, la corrige et la confirme, puis l’enregistrement passe par les adresses habituelles de l’espace Business (mêmes contrôles que les formulaires). Les prix et quantités ne sont jamais déduits d’une photo ; une valeur absente reste vide. Les photos (JPEG, PNG, WebP, 3 au plus) ne servent qu’à la question posée et ne sont pas conservées.
- **Limites et coûts de l’IA :** chaque question est réservée dans `ai_usage` (fonction `begin_ai_request`, limite quotidienne de la formule de l’abonnement, ou de la formule « test » : 50 par jour), puis complétée avec le modèle, les jetons consommés et le coût estimé (`finish_ai_request`) ; une question dont le moteur a échoué ne compte pas. Le coût vaut 0 tant que `AI_PRICE_USD_PER_MILLION` (« entrée,sortie », en dollars par million de jetons) n’est pas défini, ce qui correspond à l’offre gratuite de Gemini.
- **Abonnements (mode test, aucun paiement) :** chaque commerce reçoit la formule « Test (gratuit) » (50 questions par jour à l’assistant, 1 commerce) ; le nombre de commerces suit la formule ; « Formule et limites » l’affiche. Les formules payantes, leurs prix et le moyen de paiement restent à décider ; un changement de formule se fait pour l’instant dans la base (`subscriptions.plan_id`).
- **Migrations (dans l’ordre, historique dans `supabase_migrations.schema_migrations`) :** `20261021120000_business_schema.sql`, `20261022100000_products_stock.sql`, `20261022140000_sales_expenses.sql`, `20261023090000_ai_usage.sql`, `20261024090000_subscriptions.sql`.
- **Tests Android (`e2e/`, `pnpm test:e2e`, aussi dans la CI) :** Chromium avec l’écran, le tactile et le navigateur de deux téléphones Android (360 et 412 px). Le serveur de test (`e2e/server.mjs`) lance l’application compilée et le vrai serveur, avec une base PostgreSQL en mémoire et des services de connexion et d’IA simulés. Scénarios : parcours complet du commerçant avec les montants vérifiés, aucun débordement horizontal, bouton « retour » qui ferme une fenêtre, clavier ouvert, réseau 3G lent, hors connexion.

## Routes

`/` (conversation), `/parametres`, `/a-propos`, `/historique`, `/favoris` ; `/admin` (console d’administration, non liée depuis l’interface). L’application est une SPA : en production, toute adresse inconnue doit renvoyer `index.html`.

## Déploiement

- **Développement :** environnement Manus, avec `pnpm dev` ; la clé se configure dans les secrets de l’environnement (`GEMINI_API_KEY`).
- **Production Manus :** un conteneur Node, et non un site statique, car l’API doit rester côté serveur. Le `Dockerfile` active pnpm, installe le verrouillé, construit `dist/`, puis lance `server/index.mjs` avec `pnpm start`. La sonde `/api/health` est publique et ne révèle pas la clé.
- **Variables :** `GEMINI_API_KEY` (et éventuellement `GEMINI_MODEL`) sont des secrets injectés à l’exécution ; `PORT` est fourni par l’hébergement. La clé ne doit jamais être placée dans un fichier versionné ou dans une variable `VITE_*`.

La version déployée (numéro, commit, date de compilation) est écrite dans `dist/version.json`, annoncée par `/api/health` et affichée dans « À propos » et dans la console d’administration.

Le serveur sert aussi les routes de l’application (`/parametres`…), compresse les fichiers texte (brotli ou gzip) et met en cache les fichiers de `dist/assets`. Les vues secondaires (paramètres, console d’administration, à propos…) et le rendu Markdown sont chargés à la demande : score Lighthouse mobile de 99 en performance.

## Principes du projet

- **Honnêteté :** l’interface indique toujours ce qui est connecté, démontré ou à venir.
- **Respect du texte :** aucune substitution automatique de caractères (par ex. è → ɛ).
- **Qualité du mooré :** les textes en mooré sont rédigés et validés par des locuteurs ; les corrections des utilisateurs seront relues avant toute utilisation.
- **Confidentialité :** Gilli ne stocke aucune conversation sur un serveur : l’historique et les préférences restent dans le navigateur de l’utilisateur (désactivable) ; en mode Gemini, les messages transitent par Google pour produire les réponses. Seuls les derniers échanges (dans une limite de taille) sont envoyés au moteur.
