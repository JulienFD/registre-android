# Relais Vercel

Reçoit les synchronisations de NexPTG et les conserve, sans rien perdre, jusqu'à ce que la tablette les récupère.
Ce dossier est déployé séparément de l'app Android (Root Directory `relais` sur Vercel).

## Ce que fait le relais

| Route | Rôle |
|---|---|
| `POST /api/nexptg` | Reçoit la synchronisation NexPTG (Basic auth), la lit, la stocke dans un Blob **privé** |

| `GET /api/rapports?plaque=AB123CD[&par=julien]` | Liste les rapports d'une plaque (dernière version reçue, versions précédentes listées). `plaque=_sans-plaque` : rapports sans immatriculation |
| `GET /api/techniciens` | Liste les techniciens : les comptes de `RELAIS_COMPTES` sauf les lecteurs (jamais d'empreinte). Sert au sélecteur « Qui mesure ? » |
| `PUT /api/photos?plaque=…&phase=…&slot=…` | Reçoit une photo JPEG (corps binaire) : tout compte authentifié. Validation stricte (structure JPEG, 320–5000 px, 2 Mo max), 200 photos par plaque |
| `GET /api/photos?plaque=…&vue=etat` | Emplacements déjà pris pour une plaque (tout compte ; ni empreinte ni auteur) |
| `GET /api/photos?plaque=…` | Liste des photos d'une plaque, avec leur état de réclamation (lecteurs) |
| `GET /api/photos?plaque=…&sha=…` | Octets d'une photo (lecteurs) |
| `POST /api/photos` · `DELETE /api/photos?sha256=…&dossier=…` | Réclame / libère une photo pour un dossier (lecteurs) |
| `POST /api/rapports` | Réclame un rapport pour un dossier : `{"cle", "plaque", "dossier"}` ; `409` s'il l'est déjà par un autre dossier |
| `DELETE /api/rapports?cle=…&dossier=…` | Libère une réclamation (seul le dossier qui l'a faite) |

La lecture est réservée aux comptes listés dans `RELAIS_LECTEURS` ; les comptes des techniciens (NexPTG) ne peuvent qu'envoyer.
Toutes les réponses de lecture portent `Cache-Control: private, no-store`.

**CORS** : l'application (origine `https://localhost`) appelle `/api/techniciens` et `/api/rapports` depuis sa WebView ; le relais répond donc aux pré-requêtes `OPTIONS` et ajoute `Access-Control-Allow-Origin` pour les origines autorisées, erreurs comprises. Liste blanche, jamais de joker : `https://localhost` par défaut, étendue par la variable facultative `RELAIS_ORIGINES` (origines séparées par une virgule). `/api/nexptg` n'en a pas besoin : NexPTG est une application native.

Stockage (JSON, nom de fichier = SHA-256 du contenu, donc un renvoi identique est sans effet et une version modifiée s'ajoute) :

- `rapports/<PLAQUE>/<sha256>.json` : un rapport, avec son contenu d'origine intact (`brut`), le compte, la date de réception et les avertissements. `_sans-plaque` quand le champ « Immatriculation » est absent ou inexploitable.
- `historique/<compte>/<sha256>.json` : les mesures libres du mode « Général ».
- `reclamations/<sha256 de la clé>.json` : le dossier auquel un rapport est rattaché. La clé d'un rapport est `série#id#date de création` : elle ne change pas quand le rapport est modifié, donc toutes ses versions suivent le même dossier. L'ordre des versions se fait sur la date de **réception**, jamais sur la `date` du rapport (qui reste celle de la création).

Réponses : `200` après stockage durable seulement, `401` authentification, `405` méthode, `413` corps > 2 Mo, `422` corps illisible, `500` stockage indisponible.

## PWA photos

La page d'accueil du projet (`/`) est une application web installable (dossier `public/`) : le téléphone y prend les photos des véhicules, qui rejoignent le dossier de la tablette.

- **Connexion persistante** : on se connecte **une fois** avec un compte de `RELAIS_COMPTES` (le même que dans NexPTG), et la connexion dure **sans limite de temps** tant qu'on ne se déconnecte pas. Le mot de passe n'est jamais conservé sur le téléphone : il sert à ouvrir une session, dont seul un **jeton de rafraîchissement** est gardé. Ce jeton renouvelle en arrière-plan de courts jetons d'accès (30 minutes).
- **« Quitter »** supprime la session côté relais : le jeton devient inutilisable, même copié. Retirer le compte de `RELAIS_COMPTES`, ou changer son mot de passe, **révoque** aussitôt toutes ses sessions.
- **Photos du véhicule (Entrée / Sortie)** : les vues sont annoncées une à une, comme dans le Registre, en sautant celles déjà prises pour cette plaque.
- **NexPTG et Complément** : prise libre avec légende.
- **Chaque photo est compressée (1600 px, JPEG q 0,78) et tamponnée** (plaque, date, auteur, phase) sur le téléphone, puis placée dans une **file locale** (IndexedDB) et envoyée dès que le réseau le permet : une photo prise n'est pas perdue si la connexion est coupée.
- **Installation** : Chrome (Android) « Installer l'application », Safari (iPhone) « Sur l'écran d'accueil ». Sur iPhone, l'envoi ne reprend que page ouverte, et le stockage local d'un site non installé peut être purgé après une semaine sans usage : installer la page.
- **Caméra** : flux direct si autorisé, sinon chaque photo ouvre l'appareil photo du téléphone.
- **Essayer en local** : `npm run dev` à la racine du dépôt, puis `http://localhost:3000` (compte `demo`, mot de passe `demo-demo-demo`). C'est le vrai code du relais avec un stockage en mémoire. La caméra du navigateur n'est autorisée que sur `localhost` ou en HTTPS : pour essayer sur un téléphone, utiliser le déploiement Vercel.

Sécurité : CSP stricte (aucun script ni style inline, aucune ressource externe), en-têtes dans `vercel.json`, aucune donnée du relais dans le cache du service worker (`/api/` jamais mis en cache). Le texte saisi est toujours inséré comme texte, jamais comme HTML.

## Mise en place (une fois)

1. **Projet Vercel** : importer le dépôt GitHub, plan Hobby, *Root Directory* = `relais`, preset « Other ».
   Dans *Settings → General → Root Directory*, laisser coché *Include source files outside of the Root Directory* : le relais lit `www/nexptg.js` et `www/utils.js`.
2. **Stockage** : *Storage → Create → Blob*, accès **Private**, puis connecter le store au projet.
3. **Comptes** (un par technicien, le même identifiant que dans NexPTG) :
   ```
   node relais/scripts/creer-compte.js julien
   ```
   Le script affiche un mot de passe aléatoire (à saisir dans NexPTG, non conservé) et une entrée à copier dans la variable d'environnement `RELAIS_COMPTES` du projet. Plusieurs comptes : les séparer par `;`.
4. **Secret des sessions** (nécessaire à la PWA) : `node relais/scripts/creer-secret.js`, à saisir dans la variable `RELAIS_SECRET` (Production, sensible). Sans elle, la PWA affiche « le relais n'est pas configuré pour les sessions ». Changer ce secret déconnecte tout le monde.
5. **Compte de la tablette** (lecture seule du côté des rapports) : créer un compte `tablette` avec le même script, l'ajouter à `RELAIS_COMPTES`, puis définir `RELAIS_LECTEURS=tablette`. Ne pas lui donner à NexPTG : un compte lecteur n'a pas à saisir de mesures.
6. **Déployer**, puis dans NexPTG : adresse `https://<projet>.vercel.app/api/nexptg`, identifiant et mot de passe du compte.

## Vérification

Depuis la racine du dépôt. `-u julien` seul fait demander le mot de passe, qui n'entre pas dans l'historique du shell.

1. **Authentification** (n'écrit rien) :
   ```
   curl -i -X POST https://<projet>.vercel.app/api/nexptg -u julien \
     -H 'Content-Type: application/json' --data @tests/fixtures/nexptg-vide.json
   ```
   Attendu : `200 {"ok":true,"rapports":0,"historique":0}`. Sans `-u`, ou avec un mauvais mot de passe : `401`.

2. **Stockage** (écrit le rapport de test, plaque `AB123CD`) : la même commande avec `tests/fixtures/nexptg-rapport-champ.json`.
   Attendu : `200 {"ok":true,"rapports":1,"historique":0}` et un fichier `rapports/AB123CD/<sha256>.json` dans le store.
   Rejouer la commande doit répondre `200` de nouveau, sans créer de second fichier.

## Limites connues

- Pas de limitation de débit ni de blocage après échecs : le mot de passe aléatoire (24 caractères) rend l'essai exhaustif irréaliste, mais à ajouter si l'adresse est largement diffusée.
- Pas encore de purge : la suppression à la sortie et le nettoyage quotidien sont les livrables suivants.
- Les quotas du plan Hobby (stockage Blob, transferts) sont à vérifier sur la page d'usage de Vercel.
