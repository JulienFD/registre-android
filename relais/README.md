# Relais Vercel

Reçoit les synchronisations de NexPTG et les conserve, sans rien perdre, jusqu'à ce que la tablette les récupère.
Ce dossier est déployé séparément de l'app Android (Root Directory `relais` sur Vercel).

## Ce que fait le relais

| Route | Rôle |
|---|---|
| `POST /api/nexptg` | Reçoit la synchronisation NexPTG (Basic auth), la lit, la stocke dans un Blob **privé** |

Stockage (JSON, nom de fichier = SHA-256 du contenu, donc un renvoi identique est sans effet et une version modifiée s'ajoute) :

- `rapports/<PLAQUE>/<sha256>.json` : un rapport, avec son contenu d'origine intact (`brut`), le compte, la date de réception et les avertissements. `_sans-plaque` quand le champ « Immatriculation » est absent ou inexploitable.
- `historique/<compte>/<sha256>.json` : les mesures libres du mode « Général ».

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
4. **Déployer**, puis dans NexPTG : adresse `https://<projet>.vercel.app/api/nexptg`, identifiant et mot de passe du compte.

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
- Pas encore de lecture ni de purge : la récupération par la tablette et la suppression à la sortie sont les livrables suivants.
- Les quotas du plan Hobby (stockage Blob, transferts) sont à vérifier sur la page d'usage de Vercel.
