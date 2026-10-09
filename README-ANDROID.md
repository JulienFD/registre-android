# Registre Véhicules : application Android (Galaxy Tab)

Ce dossier contient tout le code pour fabriquer l'APK à installer sur la tablette.
Le code a été écrit sans pouvoir être essayé sur Android : la première fabrication peut demander un petit réglage.

## À installer une seule fois sur un PC (Windows, Mac ou Linux)
1. **Node.js LTS** : https://nodejs.org
2. **Android Studio** : https://developer.android.com/studio (il installe aussi Java et le kit Android ; accepter les licences au premier lancement).

## Fabriquer l'APK (dans un terminal ouvert dans ce dossier)
```
npm install
npx cap add android
node patch-android.js
npx cap sync android
npx cap open android
```
Android Studio s'ouvre. Attendre la fin de la synchronisation en bas (la première fois : plusieurs minutes), puis :
**Build > Build Bundle(s) / APK(s) > Build APK(s)**.
Un message « APK(s) generated » propose « locate » : le fichier est `android/app/build/outputs/apk/debug/app-debug.apk`.

Sans Android Studio ouvert, en ligne de commande (si Java 17 et le kit Android sont installés) : `npm run apk`.

## Installer sur la Galaxy Tab
1. Copier `app-debug.apk` sur la tablette (câble USB, Drive ou e-mail).
2. L'ouvrir depuis « Mes fichiers ». Samsung demande d'autoriser l'installation depuis cette source : accepter.
3. Lancer « Registre Vehicules ». Au premier lancement : créer le code PIN propriétaire, puis autoriser la caméra.

## Mettre à jour plus tard
Voir « Mises à jour automatiques » ci-dessous. En local, réinstaller par-dessus conserve les dossiers uniquement si l'APK est signé avec la même clé.

## Mises à jour automatiques (releases GitHub)
- L'app cherche une nouvelle version à chaque lancement (et via Réglages > « Rechercher une mise à jour »). Si une release plus récente existe, elle propose de la télécharger puis ouvre l'installateur Android. Les dossiers et photos sont conservés.
- **Publier une version** : augmenter `version` dans `package.json` (`npm version minor --no-git-tag-version`, ou `patch`/`major`) dans la PR. À la fusion sur `main`, la CI crée le tag `vX.Y.Z`, fabrique l'APK signé et publie la release. La CI (PR et release) refuse une version déjà publiée ou antérieure : chaque PR fusionnée doit donc augmenter la version.
- **Clé de signature (une seule fois)** : `keytool -genkeypair -v -keystore registre.jks -alias registre -keyalg RSA -keysize 2048 -validity 10000`, puis ajouter dans GitHub (Settings > Secrets > Actions) `KEYSTORE_BASE64` (`base64 -i registre.jks`), `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`. **Sauvegarder `registre.jks` hors du dépôt : sans elle, plus aucune mise à jour possible sans désinstaller.**
- **Première installation** : l'APK actuel de la tablette n'est pas signé avec cette clé. Le passage à la première version signée demande une désinstallation, qui efface les données : envoyer d'abord les PDF vers Drive. Ensuite, toutes les mises à jour se font par-dessus.
- Au premier usage, Android demande d'autoriser l'installation d'applications depuis « Registre Vehicules ».

## Fonctionnement sur la tablette
- Les dossiers, photos et PDF NexDiag sont enregistrés dans la mémoire privée de l'application. **Désinstaller l'application ou vider ses données efface tout.**
- Les boutons « PDF d'entrée (client) » et « PDF complet » créent le PDF (empreinte enregistrée dans le registre d'intégrité), puis ouvrent le partage Android : choisir **Drive** et le dossier d'archives.
- Dossier Drive non modifiable : le créer sur le compte propriétaire, le partager en « Lecteur » avec l'équipe, et ne laisser que le compte de la tablette en « Éditeur ».
- Les PDF créés automatiquement à la validation de l'entrée et de la sortie restent dans l'application : rouvrir le dossier et appuyer sur le bouton PDF pour les envoyer vers Drive.
- Sur Android, il n'existe pas de verrouillage des fichiers en lecture seule : la protection repose sur les droits Drive, le code PIN et l'historique.

## Limites à connaître
- La tablette est le seul exemplaire des dossiers en cours : faire envoyer les PDF vers Drive à chaque entrée et sortie.
- Tester la caméra et l'envoi vers Drive avant le premier vrai véhicule.
