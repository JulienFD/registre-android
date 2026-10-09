import { S, V, api, copieDiffere, doitCopier, hooks, nomPdf, toast } from './core.js';
import { buildPdf } from './pdf.js';

const DELAI_MS = 5000;

/* Met à jour le PDF complet dans le dossier de copie. Ce n'est pas une archive : rien n'est inscrit dans l'historique. */
async function ecrireDossierComplet(id) {
  const v = V(id);
  if (!doitCopier(v) || !window.jspdf || !(await api.copieDossier())) return;
  const blob = await buildPdf(v, S.pm[id] || [], 'full');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await api.copier({ dossier: id, nom: nomPdf(v, 'full', 0, Date.now()), bytes: bytes, ecraser: true });
}

const file = copieDiffere(ecrireDossierComplet, DELAI_MS, function (e) {
  toast('Copie vers le dossier choisi impossible : ' + (e && e.message || 'erreur'));
});

export function initCopie() {
  hooks.modifie = file.planifier;
  document.addEventListener('visibilitychange', function () { if (document.hidden) file.vider() });
}
