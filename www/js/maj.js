import { api, esc, toast } from './core.js';
import { modalHide, modalShow } from './pin.js';

const DERNIERE_RELEASE = 'https://api.github.com/repos/JulienFD/registre-android/releases/latest';

/* Au démarrage (manuel = false) : silencieux sauf s'il y a une mise à jour. Les dossiers ne sont jamais touchés. */
export async function verifierMiseAJour(manuel) {
  if (!api.appVersion) return;
  try {
    const rep = await fetch(DERNIERE_RELEASE, { headers: { Accept: 'application/vnd.github+json' } });
    if (!rep.ok) throw new Error('HTTP ' + rep.status);
    const maj = window.Utils.miseAJourDisponible(await rep.json(), await api.appVersion());
    if (maj) {
      modalShow('<h2>Mise à jour disponible</h2><p>La version ' + esc(maj.version) + ' est disponible. Vos dossiers et photos sont conservés.</p>' +
        '<div class="seg"><button class="btn" data-act="closemodal">Plus tard</button><button class="btn pri" data-act="majinstall" data-url="' + esc(maj.url) + '">Mettre à jour</button></div>');
    } else if (manuel) {
      modalHide(); toast('L’application est à jour');
    }
  } catch (e) {
    if (manuel) { modalHide(); toast('Recherche impossible : vérifier la connexion Internet') }
  }
}

export async function installerMiseAJour(url) {
  modalHide(); toast('Téléchargement de la mise à jour…');
  try { await api.installUpdate(url) } catch (e) {
    toast(e && e.code === 'PERMISSION' ? 'Autoriser l’installation dans les réglages Android, puis réessayer' : 'Mise à jour impossible');
  }
}
