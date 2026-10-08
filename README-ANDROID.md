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
Modifier le contenu de `www/`, puis `npx cap sync android` et refaire « Build APK(s) ».
Réinstaller par-dessus l'ancienne version conserve les dossiers.

## Fonctionnement sur la tablette
- Les dossiers, photos et PDF NexDiag sont enregistrés dans la mémoire privée de l'application. **Désinstaller l'application ou vider ses données efface tout.**
- Les boutons « PDF d'entrée (client) » et « PDF complet » créent le PDF (empreinte enregistrée dans le registre d'intégrité), puis ouvrent le partage Android : choisir **Drive** et le dossier d'archives.
- Dossier Drive non modifiable : le créer sur le compte propriétaire, le partager en « Lecteur » avec l'équipe, et ne laisser que le compte de la tablette en « Éditeur ».
- Les PDF créés automatiquement à la validation de l'entrée et de la sortie restent dans l'application : rouvrir le dossier et appuyer sur le bouton PDF pour les envoyer vers Drive.
- Sur Android, il n'existe pas de verrouillage des fichiers en lecture seule : la protection repose sur les droits Drive, le code PIN et l'historique.

## Limites à connaître
- La tablette est le seul exemplaire des dossiers en cours : faire envoyer les PDF vers Drive à chaque entrée et sortie.
- Tester la caméra et l'envoi vers Drive avant le premier vrai véhicule.
