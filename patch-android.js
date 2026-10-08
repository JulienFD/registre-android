// Ajoute l'autorisation caméra et verrouille l'écran en paysage ou portrait libre.
const fs = require('fs');
const f = 'android/app/src/main/AndroidManifest.xml';
let m = fs.readFileSync(f, 'utf8');
const add = [
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  '<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />'
];
add.forEach((l) => { if (!m.includes(l.split('"')[1])) m = m.replace('</manifest>', '    ' + l + '\n</manifest>'); });
fs.writeFileSync(f, m);
console.log('AndroidManifest.xml mis à jour (caméra).');
