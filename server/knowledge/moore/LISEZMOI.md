# Référence du mooré — guide pour les locuteurs et linguistes

Ce dossier contient ce que Gilli transmet au moteur d’IA (Gemini) avec **chaque demande**, pour l’aider à écrire un mooré correct. Le moteur n’est pas réentraîné : il lit ces informations à chaque fois et les suit en priorité sur ses propres connaissances.

Rien n’y est inventé : les fichiers sont livrés vides et ne doivent contenir que des textes rédigés et vérifiés par des locuteurs.

## Les trois fichiers

| Fichier | Contenu | Ce qui est envoyé au moteur |
| --- | --- | --- |
| `fiche.md` | Les règles : variante de référence, orthographe, politesse, grammaire, erreurs à éviter, ton, vocabulaire moderne, noms propres. | Tout le texte écrit hors des commentaires `<!-- … -->`. Les sections vides sont ignorées. |
| `exemples.csv` | Des questions et leurs réponses idéales en mooré (20 à 50 suffisent pour commencer). | Seulement les lignes dont le statut est `validé`. |
| `lexique.csv` | Les mots et expressions : français, mooré, catégorie, exemple, remarque. | Seulement les lignes dont le statut est `validé`. |

## Statut d’une ligne (fichiers CSV)

- `brouillon` : en cours de rédaction ;
- `à relire` : prête, en attente d’un second locuteur ;
- `validé` : relue et approuvée — **seul ce statut est envoyé au moteur** ;
- `rejeté` : gardée pour mémoire, jamais envoyée ;
- `modèle` : ligne d’exemple du fichier vide, jamais envoyée (vous pouvez la supprimer).

Conseil : faites valider chaque ligne par une autre personne que son auteur et indiquez-la dans `valide_par`.

## Modifier les fichiers

- Les CSV s’ouvrent dans Excel, LibreOffice ou Google Sheets. Enregistrez en **CSV UTF-8** (séparateur `;` ou `,`), sinon les lettres ɛ, ɩ, ʋ et les voyelles nasales seront abîmées.
- Gardez la première ligne (les noms de colonnes) telle quelle.
- Une cellule peut contenir plusieurs lignes ou des points-virgules : le tableur ajoute alors les guillemets nécessaires.
- Le serveur relit les fichiers automatiquement, en quelques secondes, sans redémarrage. En production (Manus), il faut redéployer après avoir modifié les fichiers du dépôt.

## Vérifier avant d’envoyer

```bash
pnpm moore:check
```

La commande affiche ce qui sera transmis (nombre de règles, d’exemples et de mots validés) et signale les problèmes : colonnes manquantes, statut inconnu, ligne validée sans relecteur, mot en double, texte trop long.

## Taille

Tout est envoyé à chaque demande : plus la référence est longue, plus chaque réponse coûte (quota gratuit) et plus le moteur risque de s’y perdre. Au-delà d’environ 24 000 caractères, la fin du lexique n’est plus envoyée ; la commande de vérification le signale. Quand le lexique deviendra grand (plusieurs milliers de mots), l’étape suivante sera de ne transmettre que les mots utiles à chaque question (recherche dans la base, ou « RAG »).

## Mesurer l’effet

Avant de remplir la référence, faites passer un jeu de questions avec l’outil d’évaluation de la console d’administration (`/admin`, onglet « Évaluation ») ; repassez-le après chaque série de modifications et comparez les résultats. C’est la seule façon de savoir si une règle ou un exemple améliore vraiment les réponses.

## Droits et confidentialité

- N’ajoutez que des textes que vous avez écrits ou dont vous avez le droit d’utilisation (licence ouverte ou accord écrit).
- Ces fichiers sont envoyés à Google avec chaque demande : n’y mettez aucune donnée personnelle.
