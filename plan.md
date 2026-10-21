# Plan d’implémentation — Gilli

## Moteur d’IA : Gemini via relais serveur (octobre 2026)

Le moteur de réponses est Gemini (Google), appelé par un relais Node dans `server/` afin que `GEMINI_API_KEY` ne soit jamais exposée au navigateur. La clé est une valeur secrète injectée uniquement à l’exécution ; elle n’est présente ni dans le code, ni dans Git, ni dans les ressources frontend. L’hébergement passe d’un site statique à un conteneur avec la capacité Manus `server:true`, activée sans base de données. Le `Dockerfile` compile le frontend puis exécute `server/index.mjs`, qui sert l’application et les routes `/api/*`; `/api/health` est la sonde non authentifiée. Les requêtes de conversation passent par `/api/chat`, sont limitées en taille et en fréquence, et restent transitoires : aucune conversation n’est persistée. Sans clé, l’application affiche explicitement le mode démonstration ; avec la clé configurée, le client détecte le relais et affiche Gemini comme moteur actif. L’outil `/evaluation` permet désormais d’évaluer la qualité du mooré avec un jeu de test préparé par des locuteurs, et envisager NLLB-200 (traduction) en relais si nécessaire.

## Design actuel : prototype Lovable (octobre 2026)

L’interface reprend le design du prototype Lovable (dépôt `kaso-tech/mizanga-454f3fb5`), porté dans la base React/Vite de ce dépôt sans changer de pile technique. Il remplace les directions visuelles décrites plus bas.

- **Identité :** tons argile, ocre et karité sur fond papier ; titres en Noto Serif, texte en Noto Sans (lettres du mooré couvertes) ; bande tissée inspirée des rayures du Faso Dan Fani, employée avec parcimonie ; signe de marque à deux arcs et un point.
- **Accueil :** « Comment puis-je vous aider ? », zone de saisie au centre, langue de réponse rappelée, six tâches générales.
- **Zone de saisie :** clavier des caractères du mooré (ɛ ɩ ʋ ã ẽ ĩ õ ũ Ɛ Ɩ Ʋ) inséré au curseur, collage, dictée « bientôt ».
- **Conversation :** bulle utilisateur foncée, réponses en Markdown, badge « Démonstration — aucune IA réelle », avis (positif, négatif, « Cette réponse est correcte »), signalement d’erreur en mooré avec passage sélectionné.
- **Navigation :** barre latérale repliable avec recherche, filtre Toutes / Favoris, étoile et suppression ; sélecteur de langue de réponse dans l’en-tête.
- **Préférences :** enregistrées sur l’appareil uniquement (stockage local) ; les conversations restent en mémoire.
- **Conservé de ce dépôt :** langue de réponse « Automatique », régénération, service d’IA remplaçable avec annulation, accessibilité clavier et lecteurs d’écran.

## Repositionnement (octobre 2026)

Gilli est un **assistant IA généraliste**, au même titre que Claude, ChatGPT ou Perplexity : rédiger, résumer, expliquer, apprendre, s’organiser. Sa particularité est linguistique : il doit comprendre et répondre en **mooré**, langue encore mal prise en charge par les autres assistants, puis potentiellement dans d’autres langues du Burkina Faso. Le mooré est un atout du produit, pas son unique sujet.

Conséquences sur l’interface (elles remplacent la direction visuelle « Tissage conversationnel discret » décrite plus bas) :

- **Accueil :** salutation simple et zone de saisie au centre, sans requêtes prédéfinies ; seules les consignes enregistrées par l’utilisateur y sont proposées. Le logo figure dans le menu latéral, pas dans l’en-tête.
- **Langue des réponses :** « Automatique » par défaut (même langue que l’utilisateur), modifiable depuis la zone de saisie et les paramètres.
- **Conversation :** réponses sans bulle et rendues en Markdown complet, pastille de langue sous chaque réponse, actions en icônes (copier, régénérer, avis) ; « Proposer une correction » seulement sous les réponses en mooré.
- **Navigation :** barre latérale repliable avec les conversations de la session et une recherche ; paramètres, historique, favoris et À propos dans le menu du compte.
- **Style :** interface neutre (blancs et gris), Noto Sans embarquée pour un rendu identique de ɛ, ɩ, ʋ et des voyelles nasales, bleu Gilli réservé aux accents. Les noms de langues s’écrivent en minuscules (« le mooré »).
- **Honnêteté :** inchangée. Aucune réponse, source ou phrase en mooré n’est inventée ; les textes en mooré seront fournis et validés par des locuteurs.

## Portée approuvée

Gilli est une interface web responsive et interactive qui rend concrètes la navigation, la conversation, les préférences linguistiques et les retours qualité. Le moteur Gemini est désormais accessible exclusivement par un relais serveur sécurisé, sans promesse de maîtrise linguistique du mooré et sans persistance des conversations. La recherche, l’authentification, l’audio, la base de connaissances et l’administration restent explicitement indisponibles.

## Choix d’implémentation

- **Socle :** React, TypeScript et Vite côté client, avec un serveur Node minimal de production. Le conteneur construit `dist/`, sert les ressources et relaie les appels Gemini.
- **État local :** composants React, préférences locales et conversations en mémoire ; les demandes Gemini transitent sans stockage applicatif.
- **Architecture évolutive :** les types `Conversation`, `ChatMessage`, `LinguisticPreferences`, `AiService` et `ResearchService` isolent les branchements. `remoteAiService` parle au relais local `/api/chat`, tandis que `demoAiService` reste le repli transparent si le moteur est indisponible.
- **Accessibilité :** HTML sémantique, contrôles avec libellés, focus visible, zones tactiles de 44 px minimum, contrastes élevés, respect des diacritiques du Mooré.
- **Images :** le produit est une interface conversationnelle ; aucun visuel décoratif externe n’est requis. Le signe de marque est vectoriel/CSS pour rester léger et net sur mobile.

## Directions visuelles considérées

1. **Bibliothèque moderne chaleureuse** — une interface éditoriale sobre, ancrée dans le papier et l’encre ; probabilité exploratoire : 8 %.
2. **Tissage conversationnel discret** — une structure minimaliste avec quelques lignes géométriques inspirées de la trame textile, sans motifs folklorisants ; probabilité exploratoire : 6 %.
3. **Carnet linguistique lumineux** — panneaux doux, repères de lecture et accents de terre cuite ; probabilité exploratoire : 5 %.

### Direction retenue : « Tissage conversationnel discret »

- **Mouvement de design :** minimalisme conversationnel africain contemporain, inspiré par le rythme d'une trame, pas par l'imagerie touristique.
- **Principes :** lisibilité avant décoration ; hiérarchie éditoriale calme ; une interaction par intention ; densité réduite sur mobile.
- **Philosophie colorielle :** blanc bleuté pour le fond, bleu nuit pour le texte, bleu cobalt pour la structure et l'action. Le bleu cobalt est la couleur propriétaire de Gilli.
- **Discipline du noir :** le noir absolu (`--ink-inverse`) est réservé à **une seule action primaire par écran** — ici « Se connecter ». Il ne sert ni aux cartes décoratives ni aux blocs de bas de page : la carte « Prochaine étape » de la page À propos est une surface de marque, pas un bloc noir.
- **Paradigme de mise en page :** une colonne de lecture centrée (780 px) bordée d'une navigation latérale sur grand écran ; le compositeur de message forme une base stable. Le filet de trame guide le regard entre identité, contexte et conversation.
- **Éléments signatures :** anneau ouvert ponctué d'un point de diacritique (monogramme) ; filet signature en dégradé sous l'en-tête ; badges de statut francs (« Démonstration », « Bientôt disponible »).
- **Interactions :** actions directes et locales avec retour visuel discret ; tout état non connecté explique son absence au lieu de simuler un service.
- **Animation :** transitions de panneau courtes (160–220 ms), apparition douce des messages, respect de `prefers-reduced-motion`.
- **Typographie :** `Noto Sans` embarquée pour une excellente prise en charge de ɛ, ɩ, ʋ et des diacritiques, déclinée en **sept tokens** (`--text-xs` → `--text-hero`). Aucun `px` littéral dans les composants : une valeur en dur signale un jeton manquant.
- **Rayons :** trois valeurs seulement — 6 px (contrôles), 12 px (cartes), pastille (badges). Quand tout est arrondi, plus rien ne l'est.
- **Essence de marque :** « Une porte de savoir numérique pensée pour le Mooré, avec rigueur linguistique et simplicité. » Personnalité : accueillante, fiable, attentive.
- **Voix :** claire, jamais emphatique ni trompeuse. Exemples : « Écrivez comme vous le faites habituellement. » et « Le moteur linguistique arrive progressivement ; votre texte reste le vôtre. »
- **Logo :** anneau ouvert formant une bulle de dialogue, ponctué d'un point de diacritique dans l'ouverture — bleu cobalt, fond transparent.
- **Couleur de signature :** Bleu du savoir — `#2563D4`.

### Accessibilité de la couche visuelle

Les trois niveaux d'encre secondaires (`--ink-soft`, `--ink-muted`, `--ink-faint`) sont calés pour tenir le seuil **WCAG AA (4.5:1) sur toutes les surfaces** réellement utilisées — pas seulement sur le blanc. Les valeurs ont été mesurées au rendu, en thème clair comme en thème sombre, sur `--bg`, `--bg-sidebar`, `--surface-muted`, `--surface-hover`, `--accent-soft` et `--warning-soft`. Le focus est un contour **plein** de 2 px, jamais translucide.

## Écrans et parcours de phase 1

### Conversation (`/`)

- En-tête compact : navigation, marque, statut de réponse, accès paramètres et état « Se connecter » non actif.
- Écran d’accueil quand la conversation est vide : texte de bienvenue demandé, consignes enregistrées de l’utilisateur et rappel transparent que l’IA n’est pas encore connectée.
- Composer auto-redimensionnable : entrée envoie sur ordinateur, Maj+Entrée insère une ligne ; microphone désactivé avec « Bientôt disponible » ; action d’ajout de texte visible mais sans faux service.
- Après un envoi, le texte est ajouté localement puis une réponse système non-linguistique signale avec clarté que le moteur IA n’est pas connecté. Il ne s’agit jamais d’une traduction ou d’une réponse Mooré factice.
- Actions de réponse opérationnelles en local : copie, avis positif/négatif et formulaire de signalement ; la soumission confirme seulement que le stockage n’est pas encore activé.
- Zone Sources : état vide « Recherche externe non connectée », jamais de source inventée.

### Navigation et vues secondaires

- Barre latérale sur bureau, tiroir sur mobile : Nouvelle conversation, historique, recherche, favoris, paramètres, à propos, état invité.
- Historique et favoris sont des états d'interface explicitement non persistants ; ils n'affirment pas que des conversations sont stockées. L'état vide de la barre latérale tient en deux lignes (« Vos conversations apparaîtront ici. / Aucune n'est enregistrée pour l'instant. ») : il enseigne l'usage et rappelle la limite, sans la réciter en quatre lignes.
- Vue Paramètres : langue de l’interface, langue de réponse, écriture utilisateur et écriture des réponses, thème (basculable localement), confidentialité, fonctions vocales à venir et nouvelle conversation.
- Vue À propos : mission, principes de transparence, périmètre de démonstration et prochaines intégrations, sans promesse de qualité linguistique non évaluée.

### Signalement linguistique

- Panneau compact : réponse concernée, passage facultatif, type d’erreur, proposition et explication facultative.
- La validation ne stocke rien ; elle indique clairement que la collecte et la validation éditoriale sont prévues plus tard.

## Structure projet

```text
src/
  app/              # routage local de vues et composition de l’application
  components/       # header, navigation, chat, composer, panneaux et primitives UI
  domain/           # types Conversation, préférences, contrats AiService/ResearchService
  data/             # libellés et contenus de démonstration transparents
  styles/           # tokens, thèmes, responsive et animations
  main.tsx          # point d’entrée
public/
  manus-routes.json # manifeste des routes publiques
server/             # relais Gemini, validation et sonde de santé
Dockerfile           # build et démarrage du conteneur de production
plan.md             # décision de phase 1
TODO.md             # résultats à livrer et leur état
```

## Préparation des futures intégrations

Les contrats seront centralisés et sans fournisseur imposé : une future implémentation de `AiService` produira des réponses, états de flux et annulation ; `ResearchService` portera une liste de sources réelles ; un adaptateur de stockage gérera conversations, retours et préférences après activation d’un backend. L’interface ne dépendra ni d’un fournisseur ni d’une convention de normalisation automatique. Le texte utilisateur restera inchangé ; toute future normalisation nécessitera une règle validée.

## Limites explicites de cette phase

- Pas d’authentification, de compte, de stockage permanent, d’administration ni de RLS.
- Gemini est un moteur généraliste : son exactitude en mooré reste à évaluer avec des locuteurs. Pas de recherche web, de traduction spécialisée, de dictée, de synthèse vocale ou de lecture audio.
- Pas de sources, citations, corrections ou traductions fictives.
- Les préférences et retours sont manipulables pour démontrer l’ergonomie, mais ne sont pas enregistrés durablement.
