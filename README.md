# Gilli

Gilli est une **marketplace avec un assistant d’achat**, d’abord au Burkina Faso, puis dans la zone UEMOA. Le client dit ce qu’il cherche (produit, budget, ville, caractéristiques) ; l’assistant cherche dans les annonces publiées par les commerçants, les classe et explique son choix. Les commerçants publient leurs produits depuis l’**Espace vendeur**, qui garde aussi la gestion du stock et des ventes. Le paiement et la livraison se règlent directement entre le client et le vendeur, en dehors de Gilli.

> **Moteur : Gemini (Google), offre gratuite.** Quand une clé `GEMINI_API_KEY` est configurée sur le serveur, les réponses sont produites par Gemini. Sans clé, l’application reste en **mode démonstration** et le dit explicitement.

## Fonctionnalités

- **Assistant d’achat (accueil, `/`)** : « Que cherchez-vous ? ». Le moteur comprend la demande et appelle la fonction `rechercher_annonces` (mots-clés, catégorie, budget, ville, état, caractéristiques comme « au moins 4 Go de RAM ») ; le serveur cherche dans la marketplace et **classe les annonces de façon déterministe** (`server/shopping/ranking.mjs`, score sur 100 : budget, critères demandés, mots recherchés, ville ou livraison, vendeur vérifié, annonce récente ; les annonces dans le budget passent toujours avant les autres). Sans résultat, la recherche s’élargit pas à pas (sans les mots-clés en gardant le budget, puis au-dessus du budget, en le disant). Les 5 meilleures annonces s’affichent en fiches (photo, prix, vendeur, ville, raisons et points d’attention, boutons WhatsApp, Appeler et « Voir l’annonce ») ; le moteur rédige ensuite son explication **uniquement à partir de ces résultats** : il n’invente ni produit, ni prix, ni caractéristique. Les demandes sans rapport avec un achat sont poliment refusées. Recherche web désactivée.
- **Marketplace dans l’en-tête** (icône sac) : catalogue public, recherche, page annonce et page vendeur.
- **Recherche avancée** : tri (pertinence, prix croissant ou décroissant, plus récentes), panneau « Filtres » (prix minimum, état, vendeurs vérifiés seulement, caractéristiques de la catégorie : « RAM d’au moins 4 Go », « double SIM », « 4G »…), « Voir plus d’annonces ». Les filtres sont dans l’adresse (lien partageable) et appliqués par la base (fonction `marketplace_search`).
- **Favoris** (cœur sur chaque annonce, y compris les fiches de l’assistant) : onglet Favoris avec l’état actuel de chaque annonce (prix baissé ou en hausse, plus disponible).
- **Comparaison** de 2 ou 3 annonces côte à côte (`/marketplace/comparer?ids=…`, aussi depuis les fiches de l’assistant) : prix, état, vendeur, ville et livraison, caractéristiques ; « Le moins cher » et la meilleure valeur (RAM, stockage, batterie, garantie, année, kilométrage le plus bas) sont calculés à partir des valeurs saisies par les vendeurs.
- **Alertes de recherche** (10 au plus) : « Créer une alerte » sur une recherche ; à l’ouverture de Gilli puis toutes les 15 minutes, Gilli compte les annonces publiées depuis la dernière consultation et l’indique par une pastille sur l’icône Marketplace et dans l’onglet Alertes (« Nouveau » sur les annonces). Pas encore de notification sur le téléphone.
- Favoris, comparaison et alertes sont enregistrés **sur l’appareil** sans compte ; **connecté, favoris et alertes suivent le compte** (`/api/saved`, tables `marketplace_favorites` et `marketplace_alerts`, chacun ne voit que les siens) : à la connexion, l’appareil et le compte sont réunis sans perte (une même recherche n’est suivie qu’une fois, la consultation la plus récente l’emporte), puis chaque changement est envoyé.
- **Notifications sur le téléphone** (Web Push, compte requis) : bouton « Activer les notifications » dans l’onglet Alertes, et une cloche par alerte pour les couper. Quand une annonce est publiée, la base trouve les alertes qu’elle satisfait (mêmes critères que la recherche, calculés par le serveur), sans notifier deux fois la même annonce, ni le vendeur de sa propre annonce, et 10 fois par jour au plus ; le serveur envoie alors « Nouvelle annonce : … », qui ouvre l’annonce au toucher. Les appareils qui n’existent plus sont oubliés. Sur iPhone, Gilli doit être installé sur l’écran d’accueil.
- Conversation avec réponse progressive, arrêt et régénération (les versions précédentes d’une réponse, fiches comprises, restent consultables : ‹ 1 / 2 ›) ; réponses en Markdown.
- Langue des réponses : automatique (même langue que l’utilisateur), français ou anglais.
- Fichiers joints (photos réduites avant l’envoi, PDF, texte) et messages vocaux.
- **Instructions personnelles** et **consignes enregistrées** (Paramètres › Personnalisation), prises en compte par l’assistant d’achat.
- Lecture à voix haute des réponses avec la synthèse vocale de l’appareil.
- Historique avec recherche, favoris et suppression, enregistré sur l’appareil (désactivable) et, une fois connecté, sur le compte ; sauvegarde et restauration en JSON.
- **Console d’administration** (`/admin`, application distincte, connexion par adresse e-mail et mot de passe vérifiés côté serveur, jamais liée depuis l’interface) : configuration du moteur, modération de la marketplace, référence et évaluation du mooré (en pause).
- Accessible au clavier et aux lecteurs d’écran, utilisable sur téléphone, tablette et ordinateur ; installable (PWA), l’interface s’ouvre hors connexion.
- Un seul modèle, choisi côté serveur (plus de sélecteur dans l’interface) ; les titres de conversation passent par le modèle économe pour préserver le quota principal. Quand le quota gratuit est épuisé, l’application propose de réessayer plus tard.
- Le mooré (clavier, réponses en mooré) est mis en pause ; la référence (`server/knowledge/moore/`) est conservée pour plus tard.

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
- **Côté serveur** (`server/chat-handler.mjs`) : le relais passe chaque message à l’assistant d’achat (`server/shopping/assistant.mjs`) : première demande à Gemini avec la fonction de recherche, recherche et classement par le serveur, puis seconde demande avec les résultats pour rédiger la réponse. Le navigateur reçoit d’abord les fiches (`{"listings": …}`), puis le texte fragment par fragment. Le même code tourne dans `pnpm dev` (extension Vite), `pnpm preview` et `pnpm start`.
- **Garde-fous** : taille des demandes limitée, 20 demandes par minute et par origine de connexion observée par le serveur (sans faire confiance à l’en-tête falsifiable `X-Forwarded-For`), annulation propagée quand l’utilisateur clique sur « Arrêter », erreurs traduites en messages clairs (quota gratuit atteint, clé refusée…).
- **Côté navigateur** : au démarrage, l’application interroge `/api/health` et choisit le moteur Gemini (`src/services/remoteAiService.ts`) ou la démonstration (`src/services/demoAiService.ts`).

| Variable | Rôle |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Comptes (Supabase Auth) : adresse du projet et clé **publique**. Une clé secrète (service_role) est refusée au démarrage. Absentes : pas de comptes. |
| `AI_PROVIDER` | Fournisseur d’IA (défaut : `gemini`). Une valeur inconnue empêche le démarrage. |
| `GEMINI_API_KEY` | Clé de l’API Gemini. Absente : mode démonstration. |
| `GEMINI_MODEL` | Modèle standard (défaut : `gemini-flash-latest`, alias du Flash le plus récent). |
| `GEMINI_LITE_MODEL` | Modèle économe, utilisé pour les titres et la modération (défaut : `gemini-flash-lite-latest`). |
| `ADMIN_EMAIL` | Adresse e-mail de connexion à la console d’administration. Absente : console fermée. |
| `ADMIN_PASSWORD` | Mot de passe de la console d’administration (12 caractères au moins). Absent : console fermée. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Facultatives : clés des notifications du téléphone. Absentes, le serveur génère une paire à la première utilisation et la garde dans la base (schéma privé, accessible avec `MODERATION_KEY`, indispensable aux notifications). |
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
- **Espace vendeur** (`/business`, compte requis) : création du commerce (pays de la zone UEMOA, francs CFA), produits (prix d’achat et de vente, unité, seuil d’alerte, stock initial), mouvements de stock (achat, retour client, perte, inventaire), historique par produit, alertes « Stock bas » et « Rupture », valeur du stock au prix d’achat. La quantité ne change que par les fonctions SQL `create_product` et `record_stock_movement` (journal, stock jamais négatif) ; le serveur (`server/business/`) vérifie le compte et interroge Supabase avec le jeton de l’utilisateur.
- **Conversations enregistrées sur le compte** (`/api/conversations`, table `conversations`) : assistant d’achat et assistant de l’Espace vendeur (type `general` ou `commerce`, ce dernier rattaché à un commerce dont l’utilisateur est membre). Chacun ne voit que les siennes (RLS). À la connexion, l’appareil et le compte sont réunis (la version la plus récente l’emporte, une conversation supprimée ailleurs disparaît) ; ensuite chaque modification est envoyée. Le menu latéral les liste ensemble, avec une icône par espace (💬 assistant d’achat, 🏪 Espace vendeur). La console d’administration a son propre menu latéral (ses sections et « Retour à Gilli »).
- **Ventes, dépenses et résultats :** une vente compte plusieurs produits (prix proposé modifiable) et fait baisser le stock dans la même opération ; le propriétaire peut l’annuler (le stock revient, la vente reste visible). Les dépenses (loyer, transport…) sont datées dans le fuseau du commerce. Les achats de marchandises passent par le stock, pas par les dépenses, pour ne pas compter deux fois le même coût.
- **Calculs (déterministes, faits par la base — fonctions `business_summary` et `business_product_sales`) :** total d’une ligne = quantité × prix, arrondi au franc ; coût d’une ligne = quantité × prix d’achat au moment de la vente ; chiffre d’affaires et coût des produits vendus sur les ventes non annulées ; marge brute = chiffre d’affaires − coût des produits vendus ; résultat estimé = marge brute − dépenses. Les périodes sont des jours du calendrier local du commerce. L’écran rappelle qu’il s’agit d’une estimation, pas d’un résultat comptable ou fiscal certifié.
- **Assistant Business** (onglet Assistant) : questions en langage courant sur le commerce. Le serveur calcule un résumé chiffré avec les droits de l’utilisateur (résultats d’aujourd’hui, des 7 derniers jours, du mois et du mois dernier, ventes par produit, dépenses par catégorie, état du stock) et le transmet au moteur d’IA avec la consigne de n’inventer aucun chiffre ; ni noms de clients, ni notes, ni descriptions, ni identifiants ne sont transmis, et la recherche web est désactivée. Le résumé est montré sous chaque réponse (« Chiffres utilisés par l’assistant »). La conversation est enregistrée sur le compte avec ses fiches et leur état, et se retrouve dans le menu latéral.
- **Assistant de gestion (actions) :** l’assistant peut préparer des fiches de nouveau produit (avec ou sans photo du produit), de mouvement de stock (achat, retour, perte, inventaire), de vente (prix habituel proposé si aucun prix n’est donné), de dépense et d’annulation d’une vente récente (propriétaire seulement ; le modèle reçoit les ventes des 7 derniers jours avec une référence courte, sans noms de clients), grâce aux « fonctions » de Gemini (`server/business/assistant-actions.mjs`). Le modèle ne fait que proposer : la fiche s’affiche dans la conversation, le commerçant la vérifie, la corrige et la confirme, puis l’enregistrement passe par les adresses habituelles de l’espace Business (mêmes contrôles que les formulaires). Les prix et quantités ne sont jamais déduits d’une photo ; une valeur absente reste vide. Les photos (JPEG, PNG, WebP, 3 au plus) ne servent qu’à la question posée et ne sont pas conservées.
- **Limites et coûts de l’IA :** chaque question est réservée dans `ai_usage` (fonction `begin_ai_request`, limite quotidienne de la formule de l’abonnement, ou de la formule « test » : 50 par jour), puis complétée avec le modèle, les jetons consommés et le coût estimé (`finish_ai_request`) ; une question dont le moteur a échoué ne compte pas. Le coût vaut 0 tant que `AI_PRICE_USD_PER_MILLION` (« entrée,sortie », en dollars par million de jetons) n’est pas défini, ce qui correspond à l’offre gratuite de Gemini.
- **Abonnements (mode test, aucun paiement) :** chaque commerce reçoit la formule « Test (gratuit) » (50 questions par jour à l’assistant, 1 commerce) ; le nombre de commerces suit la formule ; « Formule et limites » l’affiche. Les formules payantes, leurs prix et le moyen de paiement restent à décider ; un changement de formule se fait pour l’instant dans la base (`subscriptions.plan_id`).
- **Marketplace (phase 1, `/marketplace`, publique) :** le propriétaire crée sa vitrine (nom, ville, WhatsApp ou appel, villes de livraison) et publie ses produits (catégorie, état, caractéristiques, jusqu’à 5 photos dans Supabase Storage). Prix et stock viennent du produit : un produit épuisé n’est plus proposé. Recherche par mots, catégorie, ville (vendeurs de la ville puis ceux qui y livrent), budget et état ; page annonce avec WhatsApp (message prêt) et appel ; page vendeur ; signalements (trois renvoient l’annonce en vérification). Conditions d’utilisation : `/conditions`, avec la liste des produits interdits.
- **Modération des annonces :** toute annonce créée ou modifiée part « en attente » ; le serveur la contrôle (règles gratuites de `server/marketplace/rules.mjs` : mots interdits même déguisés et texte incompréhensible, puis agent IA sur le modèle économe avec les photos) et la publie, ou l’envoie en vérification humaine (console `/admin`, « Modération marketplace » : publier, refuser, masquer, badge « vendeur vérifié »). Les décisions passent par une clé de modération connue du serveur seul : `MODERATION_KEY` (24 caractères au moins) côté serveur, et la même valeur enregistrée une fois dans la base avec `select public.set_moderation_key('…');` (éditeur SQL de Supabase). Sans elle, les annonces attendent.
- **Migrations (dans l’ordre, historique dans `supabase_migrations.schema_migrations`) :** `20261021120000_business_schema.sql`, `20261022100000_products_stock.sql`, `20261022140000_sales_expenses.sql`, `20261023090000_ai_usage.sql`, `20261024090000_subscriptions.sql`, `20261025090000_marketplace.sql`, `20261026090000_conversations.sql`, `20261027090000_livestock.sql` et `20261028090000_agriculture.sql` (anciens modules Élevage et Agriculture), `20261029090000_marketplace_search_v2.sql` (recherche avancée), `20261030090000_drop_livestock_agriculture.sql` (suppression définitive des tables, fonctions et conversations Élevage et Agriculture), `20261031090000_marketplace_account.sql` (favoris, alertes et notifications sur le compte).
- **Tests Android (`e2e/`, `pnpm test:e2e`, aussi dans la CI) :** Chromium avec l’écran, le tactile et le navigateur de deux téléphones Android (360 et 412 px). Le serveur de test (`e2e/server.mjs`) lance l’application compilée et le vrai serveur, avec une base PostgreSQL en mémoire et des services de connexion et d’IA simulés. Scénarios : assistant d’achat (un commerçant publie, un client décrit son besoin et reçoit les fiches), recherche avancée, favoris, comparaison et alertes, favoris et alertes retrouvés sur un second téléphone, parcours complet du commerçant avec les montants vérifiés, aucun débordement horizontal, bouton « retour » qui ferme une fenêtre, clavier ouvert, réseau 3G lent, hors connexion.

## Routes

`/` (assistant d’achat), `/marketplace` (et `/marketplace/annonce/…`, `/marketplace/vendeur/…`, `/marketplace/favoris`, `/marketplace/alertes`, `/marketplace/comparer?ids=…`), `/business` (Espace vendeur), `/conditions`, `/parametres`, `/a-propos`, `/historique`, `/favoris` ; `/admin` (console d’administration, non liée depuis l’interface). L’application est une SPA : en production, toute adresse inconnue doit renvoyer `index.html`.

## Déploiement

- **Développement :** environnement Manus, avec `pnpm dev` ; la clé se configure dans les secrets de l’environnement (`GEMINI_API_KEY`).
- **Production Manus :** un conteneur Node, et non un site statique, car l’API doit rester côté serveur. Le `Dockerfile` active pnpm, installe le verrouillé, construit `dist/`, puis lance `server/index.mjs` avec `pnpm start`. La sonde `/api/health` est publique et ne révèle pas la clé.
- **Variables :** `GEMINI_API_KEY` (et éventuellement `GEMINI_MODEL`) sont des secrets injectés à l’exécution ; `PORT` est fourni par l’hébergement. La clé ne doit jamais être placée dans un fichier versionné ou dans une variable `VITE_*`.

La version déployée (numéro, commit, date de compilation) est écrite dans `dist/version.json`, annoncée par `/api/health` et affichée dans « À propos » et dans la console d’administration.

Le serveur sert aussi les routes de l’application (`/parametres`…), compresse les fichiers texte (brotli ou gzip) et met en cache les fichiers de `dist/assets`. Les vues secondaires (paramètres, console d’administration, à propos…) et le rendu Markdown sont chargés à la demande : score Lighthouse mobile de 99 en performance.

## Principes du projet

- **Honnêteté :** l’interface indique toujours ce qui est connecté, démontré ou à venir.
- **Respect du texte :** aucune substitution automatique de caractères (par ex. è → ɛ).
- **Chiffres vérifiables :** les prix, scores et calculs viennent des données et du serveur ; l’IA explique, elle ne fabrique pas les chiffres. Les résultats de gestion sont des estimations, pas une comptabilité certifiée.
- **Qualité du mooré (en pause) :** aucun texte en mooré n’est inventé ; il sera rédigé et validé par des locuteurs.
- **Confidentialité :** sans compte, l’historique et les préférences restent dans le navigateur de l’utilisateur (désactivable). Connecté, les conversations sont aussi enregistrées sur son compte (table `conversations`, visible de lui seul, sans le contenu des fichiers joints) et quittent l’appareil à la déconnexion ; en mode Gemini, les messages transitent par Google pour produire les réponses. Seuls les derniers échanges (dans une limite de taille) sont envoyés au moteur.
