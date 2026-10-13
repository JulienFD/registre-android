# Relais Vercel

Reçoit les synchronisations de NexPTG et les conserve, sans rien perdre, jusqu'à ce que la tablette les récupère.
Ce dossier est déployé séparément de l'app Android (Root Directory `relais` sur Vercel).

## Ce que fait le relais

| Route | Rôle |
|---|---|
| `POST /api/nexptg` | Reçoit la synchronisation NexPTG (Basic auth), la lit, la stocke dans un Blob **privé** |

| `GET /api/rapports?plaque=AB123CD[&par=julien]` | Liste les rapports d'une plaque (dernière version reçue, versions précédentes listées). `plaque=_sans-plaque` : rapports sans immatriculation |
| `GET /api/techniciens` | Liste les techniciens : les comptes de `RELAIS_COMPTES` sauf les lecteurs (jamais d'empreinte). Sert au sélecteur « Qui mesure ? » |
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

## Mise en place (une fois)

1. **Projet Vercel** : importer le dépôt GitHub, plan Hobby, *Root Directory* = `relais`, preset « Other ».
   Dans *Settings → General → Root Directory*, laisser coché *Include source files outside of the Root Directory* : le relais lit `www/nexptg.js` et `www/utils.js`.
2. **Stockage** : *Storage → Create → Blob*, accès **Private**, puis connecter le store au projet.
3. **Comptes** (un par technicien, le même identifiant que dans NexPTG) :
   ```
   node relais/scripts/creer-compte.js julien
   ```
   Le script affiche un mot de passe aléatoire (à saisir dans NexPTG, non conservé) et une entrée à copier dans la variable d'environnement `RELAIS_COMPTES` du projet. Plusieurs comptes : les séparer par `;`.
4. **Compte de la tablette** (lecture seule du côté des rapports) : créer un compte `tablette` avec le même script, l'ajouter à `RELAIS_COMPTES`, puis définir `RELAIS_LECTEURS=tablette`. Ne pas lui donner à NexPTG : un compte lecteur n'a pas à saisir de mesures.
5. **Déployer**, puis dans NexPTG : adresse `https://<projet>.vercel.app/api/nexptg`, identifiant et mot de passe du compte.

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
