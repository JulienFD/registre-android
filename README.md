# Registre Véhicules

Application Android de suivi des véhicules en atelier, pensée pour une tablette Galaxy Tab. Elle remplace le registre papier : entrée du véhicule, état des lieux en photos, suivi des travaux, sortie et PDF d'archive.

Tout fonctionne hors ligne : les données restent sur la tablette, sans compte ni serveur.

[![CI](https://github.com/JulienFD/registre-android/actions/workflows/ci.yml/badge.svg)](https://github.com/JulienFD/registre-android/actions/workflows/ci.yml)

## Fonctionnalités

- **Tableau de suivi** en quatre colonnes (entrée en cours, en atelier, contrôle qualité, prête à sortir), avec recherche multi-mots et filtres par type, responsable et retard.
- **Fiche véhicule** : plaque (française ou étrangère), marque, modèle, kilométrage, carburant, clés, objets à bord.
- **État des lieux** : 12 photos guidées à l'entrée, checklist de contrôle et marquage des dommages sur schémas du véhicule.
- **Compléments** datés ajoutés au dossier après l'entrée (découverte après lavage, remarque du client, etc.).
- **PDF** d'entrée (client) et complet, avec empreinte enregistrée dans un registre d'intégrité, partagés via Drive.
- **Code PIN propriétaire** et verrouillage des dossiers validés.

## Démarrage rapide

Prérequis : [Node.js](https://nodejs.org) LTS et [Android Studio](https://developer.android.com/studio) (ou Java 21 et le SDK Android pour la ligne de commande).

```bash
npm install
npm run ajouter-android   # crée le projet Android et applique patch-android.js
npm run ouvrir            # ouvre Android Studio
```

Dans Android Studio : **Build > Build Bundle(s) / APK(s) > Build APK(s)**. L'APK est généré dans `android/app/build/outputs/apk/debug/app-debug.apk`.

Sans Android Studio : `npm run apk`.

> [!TIP]
> Chaque tag `v*` publie automatiquement l'APK dans une [release GitHub](https://github.com/JulienFD/registre-android/releases).

Installation sur la tablette, mise à jour et limites : voir [README-ANDROID.md](README-ANDROID.md).

> [!WARNING]
> La tablette est le seul exemplaire des dossiers en cours. Désinstaller l'application ou vider ses données efface tout : envoyer les PDF vers Drive à chaque entrée et sortie.

## Développement

L'interface est en JavaScript natif (modules ES, sans framework ni bundler) dans `www/`, embarquée dans une coque [Capacitor](https://capacitorjs.com) 8.

```
www/
├── index.html        # point d'entrée (CSP stricte, pas de script inline)
├── android-api.js    # pont vers les plugins Capacitor (fichiers, partage)
├── utils.js          # logique pure (plaques, dates, règles), testée
├── js/               # modules : core, board, sheet, dossier, photos, camera, pdf, pin…
├── css/              # une feuille par zone
└── vendor/           # jsPDF, pdf.js, polices (embarqués, aucun appel réseau)
android/              # projet Android (package fr.spformation.registrevehicules)
tests/                # tests Node
```

| Commande | Rôle |
| --- | --- |
| `npm run lint` | ESLint |
| `npm test` | Tests unitaires (`node --test`) |
| `npm run check` | Lint + tests, à lancer avant chaque commit |
| `npm run synchroniser` | Copie `www/` dans le projet Android |
| `cd android && ./gradlew lintDebug testDebugUnitTest assembleDebug` | Lint Android, tests JVM et APK debug |

Les conventions (TDD, Conventional Commits, structure des modules) sont décrites dans [CLAUDE.md](CLAUDE.md).

> [!NOTE]
> Ne jamais éditer `android/app/src/main/assets/public/` : ce dossier est regénéré par `cap sync`.
