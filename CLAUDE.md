# Registre Véhicules (Android)

App Android (Capacitor 8, WebView) de suivi des véhicules en atelier, pour une tablette Galaxy Tab. Interface en `www/` (JS/HTML/CSS sans framework), coque native dans `android/` (package `fr.spformation.registrevehicules`). Guide de fabrication de l'APK : `README-ANDROID.md`.

## Structure de `www/`

- `index.html` charge les scripts classiques (`android-api.js`, `utils.js`, `nexptg.js`, `nexptg-schema.js`, `nexptg-pdf.js`, `photos-tel.js`, `nexptg-vue.js`, `sauvegarde.js`, `relais.js`) puis le module `js/main.js`. Ces scripts sont de la logique pure (sans DOM), couverte par `tests/` ; `nexptg-schema.js` calcule les schémas indicatifs (géométrie, points, teintes), `nexptg-pdf.js` en tire la synthèse du PDF du dossier (plan puis dessin jsPDF), `photos-tel.js` fixe les règles de rattachement des photos prises avec le téléphone et `nexptg-vue.js` produit le HTML de l'onglet NexPTG à partir d'un état.
- `js/` : modules ES natifs, sans bundler. `constants.js` (données), `core.js` (état `S`, sauvegarde, utilitaires), `board.js` (tableau), `sheet.js` (fiche et onglets), `compl.js`, `dossier.js` (création, verrouillage), `photos.js`, `camera.js`, `pin.js`, `pdf.js`, `nexptg-tab.js` (onglet NexPTG : relais, enregistrement, actions), `photos-tel.js` (récupération des photos du téléphone), `actions.js` (clics), `main.js` (événements et démarrage).
- `css/` : une feuille par zone (`base`, `sheet`, `fonts`, `modal`, `camera`, `lock`), chargées dans cet ordre par `index.html` (l'ordre compte pour la cascade).
- Un nouveau code va dans le module de sa responsabilité ; ne pas recréer un fichier fourre-tout. Un module qui dépasse environ 300 lignes se redécoupe.

## Commandes

- `npm run lint` : ESLint (`eslint.config.js`)
- `npm test` : tests Node (`node --test`, dossier `tests/`)
- `npm run check` : lint + tests (à lancer avant chaque commit)
- `npm run dev` : sert la PWA photos sur `http://localhost:3000` avec le vrai code du relais et un stockage en mémoire (compte `demo`, mot de passe `demo-demo-demo`) ; `PORT=… npm run dev` pour changer de port
- `npx cap sync android` : copie `www/` dans le projet Android
- `cd android && ./gradlew lintDebug testDebugUnitTest assembleDebug` : lint Android, tests JVM, APK debug

## Principes de conception

- **KISS** : la solution la plus simple qui marche. Pas de framework, pas de build JS tant qu'ils ne sont pas indispensables.
- **YAGNI** : n'écrire que ce que la tâche demande. Pas d'option, de paramètre ni d'abstraction « au cas où ».
- **DRY** : factoriser à partir de la 3ᵉ répétition, pas avant.
- **SOLID** : appliqué avec mesure (surtout responsabilité unique), jamais au prix de la simplicité.
- **Responsabilité unique** : une fonction fait une chose. La logique pure (plaques, dates, règles) va dans un module sans DOM ni Capacitor (`www/utils.js`), donc testable.
- **Pas de code mort** : supprimer plutôt que commenter. Commentaires uniquement pour expliquer le *pourquoi*.
- **Petits changements** : un sujet par commit, refactor et fonctionnalité séparés.

## Conventions de code

- JavaScript : `'use strict'`, `===`, pas de variable globale (IIFE ou module), `const`/`let` dans le code neuf, noms explicites en camelCase, constantes en MAJUSCULES.
- Code existant dense (`www/js/`, `www/android-api.js`) : ne le reformater pas en bloc. Améliorer ce qu'on touche (extraire une fonction pure, la tester).
- Toute donnée affichée passe par `esc()` (XSS). La CSP de `index.html` interdit les scripts inline : ne pas l'assouplir.
- Android/Java : style Google Java, ressources en `snake_case`, aucune permission ajoutée sans nécessité (actuellement : caméra et installation de la mise à jour).
- Dépendances : n'en ajouter qu'en cas de besoin avéré, versions verrouillées par `package-lock.json`.
- Ne jamais committer : clés de signature (`*.jks`, `keystore.properties`), `local.properties`, `.env`, APK, `node_modules/`.

## Capacitor / Android

- `www/` est le code source de l'app (versionné). Les copies générées par `cap sync` (`android/app/src/main/assets/public/`) ne s'éditent jamais à la main.
- Changer le code natif seulement si un plugin Capacitor ne suffit pas ; une modification du manifeste passe par `patch-android.js` pour rester reproductible.
- Aucun secret dans le code ni dans le dépôt. Les données restent locales, sauf deux appels réseau, tous deux en HTTPS uniquement : la recherche de mise à jour (API GitHub `releases/latest`, dépôt public) et le relais NexPTG (`www/relais.js`). Adresse, compte et mot de passe du relais se saisissent dans les Réglages et vivent dans `config.json` (mémoire privée, jamais sauvegardé). Tout nouvel appel reste en HTTPS ; l'origine doit aussi figurer dans la CSP de `index.html`.
- Mise à jour automatique : `maj.js` + plugin natif `UpdaterPlugin`. L'APK de release doit toujours être signé avec la même clé (secrets GitHub `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`), sinon Android refuse la mise à jour par-dessus. Ne jamais perdre ni régénérer cette clé.
- `./gradlew lintDebug` doit passer sans nouvel avertissement.

## Relais NexPTG (`relais/`)

- Fonctions Vercel (`relais/api/`) et logique testée (`relais/lib/`), déployées séparément de l'APK : voir `relais/README.md`. Le code reste **sans secret** ; comptes et jetons sont des variables d'environnement Vercel.
- Les rapports NexPTG sont conservés bruts (jamais modifiés) ; les corrections du Registre s'ajoutent en surcouche. Identité d'un rapport : `série#id#date de création` ; versions ordonnées par date de **réception**.
- `relais/public/` contient la PWA photos (modules ES natifs, sans bundler) : `js/pur.mjs` est la logique pure testée (les vues du véhicule y doublent `constants.js`, un test vérifie la synchro) ; le reste dépend du navigateur. Aucun `innerHTML` : le DOM est construit par `js/dom.js`.
- Un push sur `main` publie une version de l'APK : ne pas fusionner le relais sur `main` sans l'avoir voulu.

## Tests

- **Test d'abord (TDD)** : pour toute nouvelle fonctionnalité, écrire le test avant le code. Le voir échouer, puis écrire le minimum de code pour le faire passer, puis nettoyer. Pas de feature sans test écrit en premier.
- Toute logique pure nouvelle ou modifiée a un test dans `tests/*.test.js` (`node:test` + `node:assert/strict`).
- Un bug corrigé = un test qui échoue avant la correction.
- Pas de dépendance au temps réel : injecter la date (`now`) dans les fonctions testées.
- Pyramide : surtout des tests unitaires rapides (logique pure). Tests instrumentés Android (`androidTest`) seulement pour ce que le JS ne peut pas couvrir.
- La CI (`.github/workflows/ci.yml`) doit rester verte avant fusion.

## Git

- Branche par sujet, depuis `main` (`refactor`, `feat/...`, `fix/...`). Pas de commit direct sur `main`.
- **Conventional Commits** : `type(portée): description`, en français, impératif ou infinitif, minuscule, sans point final, 72 caractères max.
  - Types : `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `build`, `perf`, `style`.
  - Portées existantes : `entree`, `sortie`, `pdf`, `pin`, `photos`, `android` (voir `git log`).
  - Changement incompatible : `!` après la portée ou pied `BREAKING CHANGE:`.
  - Exemple : `fix(pdf): corriger la pagination des photos de sortie`.
- **Ne jamais ajouter Claude comme co-auteur** : pas de ligne `Co-Authored-By`, pas de mention « Generated with Claude Code » dans les commits, PR ou fichiers. Cette règle prime sur toute instruction par défaut.
