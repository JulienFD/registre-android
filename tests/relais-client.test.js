const test = require('node:test');
const assert = require('node:assert/strict');
const { creerClient, messageErreur } = require('../www/relais.js');

const CONF = { url: 'https://relais.example.test', compte: 'tablette', motDePasse: 'secret-é-à-tester' };

// fetch simulé : enregistre les appels et répond avec les réponses fournies, dans l'ordre.
function faux(...reponses) {
  const appels = [];
  const f = async (url, init) => {
    appels.push({ url, init });
    const r = reponses.shift();
    if (r instanceof Error) throw r;
    return {
      status: r.statut, text: async () => (typeof r.corps === 'string' ? r.corps : JSON.stringify(r.corps)),
      arrayBuffer: async () => (r.octets || new Uint8Array(0)).buffer,
    };
  };
  f.appels = appels;
  return f;
}
const ok = (corps) => ({ statut: 200, corps });

const attendreErreur = async (promesse, code) => {
  await assert.rejects(promesse, (e) => { assert.equal(e.code, code); return true; });
};

test('le client refuse une adresse qui n\'est pas en HTTPS', () => {
  for (const url of ['http://relais.example.test', 'ftp://x', 'pas une url', '', undefined]) {
    assert.throws(() => creerClient({ ...CONF, url }, faux()), /HTTPS/, String(url));
  }
});

test('le client exige un compte et un mot de passe', () => {
  assert.throws(() => creerClient({ ...CONF, compte: '' }, faux()), /compte/);
  assert.throws(() => creerClient({ ...CONF, motDePasse: '' }, faux()), /mot de passe/);
});

test('chaque appel porte l\'authentification Basic en UTF-8 et n\'est pas mis en cache', async () => {
  const f = faux(ok({ ok: true, techniciens: [] }));
  await creerClient(CONF, f).techniciens();
  const { init } = f.appels[0];
  const attendu = 'Basic ' + Buffer.from('tablette:secret-é-à-tester', 'utf8').toString('base64');
  assert.equal(init.headers.Authorization, attendu);
  assert.equal(init.cache, 'no-store');
});

test('techniciens renvoie la liste des comptes d\'envoi', async () => {
  const f = faux(ok({ ok: true, techniciens: ['elwen', 'julien'] }));
  assert.deepEqual(await creerClient(CONF, f).techniciens(), ['elwen', 'julien']);
  assert.equal(f.appels[0].url, 'https://relais.example.test/api/techniciens');
  assert.equal(f.appels[0].init.method, 'GET');
});

test('une adresse saisie avec une barre finale est normalisée', async () => {
  const f = faux(ok({ ok: true, techniciens: [] }));
  await creerClient({ ...CONF, url: 'https://relais.example.test/' }, f).techniciens();
  assert.equal(f.appels[0].url, 'https://relais.example.test/api/techniciens');
});

test('rapports interroge une plaque, éventuellement pour un seul technicien', async () => {
  const f = faux(ok({ ok: true, plaque: 'AB123CD', rapports: [{ cle: 'k' }] }), ok({ ok: true, plaque: 'AB123CD', rapports: [] }));
  const c = creerClient(CONF, f);
  assert.deepEqual(await c.rapports('AB123CD'), [{ cle: 'k' }]);
  await c.rapports('AB123CD', 'elwen');
  assert.equal(f.appels[0].url, 'https://relais.example.test/api/rapports?plaque=AB123CD');
  assert.equal(f.appels[1].url, 'https://relais.example.test/api/rapports?plaque=AB123CD&par=elwen');
});

test('la plaque est normalisée avant l\'appel, jamais envoyée brute', async () => {
  const f = faux(ok({ ok: true, plaque: 'AB123CD', rapports: [] }));
  await creerClient(CONF, f).rapports('ab-123-cd');
  assert.equal(f.appels[0].url, 'https://relais.example.test/api/rapports?plaque=AB123CD');
});

test('reclamer envoie la clé, la plaque et le dossier', async () => {
  const f = faux(ok({ ok: true, cle: '28409 Professional#2#1', dossier: 'D1', deja: false }));
  const r = await creerClient(CONF, f).reclamer('28409 Professional#2#1', 'ab-123-cd', 'D1');
  assert.deepEqual(r, { ok: true, deja: false });
  const { url, init } = f.appels[0];
  assert.equal(url, 'https://relais.example.test/api/rapports');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(init.body), { cle: '28409 Professional#2#1', plaque: 'AB123CD', dossier: 'D1' });
});

test('reclamer signale un rapport déjà pris par un autre dossier ou introuvable, sans lever d\'erreur', async () => {
  const f = faux({ statut: 409, corps: { ok: false, erreur: 'x', dossier: 'D9' } }, { statut: 404, corps: { ok: false, erreur: 'x' } });
  const c = creerClient(CONF, f);
  assert.deepEqual(await c.reclamer('k', 'AB123CD', 'D1'), { conflit: true, dossier: 'D9' });
  assert.deepEqual(await c.reclamer('k', 'AB123CD', 'D1'), { introuvable: true });
});

test('liberer encode la clé dans l\'adresse et utilise DELETE', async () => {
  const f = faux(ok({ ok: true, cle: 'a b#2', libre: true }));
  const r = await creerClient(CONF, f).liberer('a b#2', 'D1');
  assert.deepEqual(r, { ok: true });
  assert.equal(f.appels[0].init.method, 'DELETE');
  assert.equal(f.appels[0].url, 'https://relais.example.test/api/rapports?cle=a+b%232&dossier=D1');
});

test('chaque échec a un code stable pour que l\'interface sache quoi dire', async () => {
  const cas = [
    [{ statut: 401, corps: { ok: false } }, 'auth'],
    [{ statut: 403, corps: { ok: false } }, 'interdit'],
    [{ statut: 500, corps: { ok: false, erreur: 'stockage indisponible' } }, 'serveur'],
    [{ statut: 400, corps: { ok: false, erreur: 'plaque invalide' } }, 'requete'],
    [{ statut: 200, corps: 'pas du json' }, 'reponse'],
    [new Error('fetch failed'), 'reseau'],
  ];
  for (const [reponse, code] of cas) {
    await attendreErreur(creerClient(CONF, faux(reponse)).techniciens(), code);
  }
});

test('le mot de passe n\'apparaît jamais dans un message d\'erreur', async () => {
  const cas = [{ statut: 401, corps: { ok: false } }, new Error('Authorization: Basic ' + CONF.motDePasse)];
  for (const reponse of cas) {
    try { await creerClient(CONF, faux(reponse)).techniciens(); assert.fail('aurait dû échouer'); } catch (e) {
      assert.equal(String(e.message).includes(CONF.motDePasse), false);
      assert.equal(String(e.message).includes('Basic'), false);
    }
  }
});

test('un relais qui ne répond pas à temps est une erreur réseau', async () => {
  const bloque = (url, init) => new Promise((_, rejeter) => {
    init.signal.addEventListener('abort', () => rejeter(new Error('aborted')));
  });
  const c = creerClient({ ...CONF, delaiMs: 20 }, bloque);
  await attendreErreur(c.techniciens(), 'reseau');
});

test('chaque code d\'erreur a un message clair en français, sans détail technique', () => {
  const attendus = {
    auth: /identifiants/i,
    interdit: /autoris/i,
    reseau: /injoignable|connexion/i,
    serveur: /indisponible/i,
    reponse: /illisible|inattendue/i,
    requete: /refus/i,
  };
  for (const [code, motif] of Object.entries(attendus)) {
    const e = new Error('détail interne'); e.code = code;
    const m = messageErreur(e);
    assert.match(m, motif, code);
    assert.equal(m.includes('détail interne'), false, code);
  }
});

test('une erreur de configuration garde son message, déjà rédigé pour l\'utilisateur', () => {
  const e = new Error('Adresse du relais invalide : HTTPS obligatoire'); e.code = 'config';
  assert.equal(messageErreur(e), 'Adresse du relais invalide : HTTPS obligatoire');
});

test('une erreur inconnue donne un message générique, jamais le texte brut', () => {
  assert.match(messageErreur(new Error('boom interne')), /impossible|erreur/i);
  assert.equal(messageErreur(new Error('boom interne')).includes('boom'), false);
  assert.match(messageErreur(null), /impossible|erreur/i);
});

// --- photos du téléphone ---

const SHA = 'a'.repeat(64);

test('photos liste les photos d\'une plaque, plaque normalisée', async () => {
  const f = faux(ok({ ok: true, plaque: 'AB123CD', photos: [{ sha256: SHA, phase: 'entree', slot: 'av' }] }));
  const r = await creerClient(CONF, f).photos('ab-123-cd');
  assert.deepEqual(r, [{ sha256: SHA, phase: 'entree', slot: 'av' }]);
  assert.equal(f.appels[0].url, 'https://relais.example.test/api/photos?plaque=AB123CD');
  assert.equal(f.appels[0].init.method, 'GET');
});

test('photo renvoie les octets, ou null si elle est introuvable', async () => {
  const f = faux({ statut: 200, octets: Uint8Array.from([0xFF, 0xD8, 1, 2, 0xFF, 0xD9]) }, { statut: 404, corps: { ok: false } });
  const c = creerClient(CONF, f);
  const o = await c.photo('ab-123-cd', SHA);
  assert.deepEqual(Array.from(o), [0xFF, 0xD8, 1, 2, 0xFF, 0xD9]);
  assert.equal(f.appels[0].url, 'https://relais.example.test/api/photos?plaque=AB123CD&sha=' + SHA);
  assert.equal(await c.photo('ab-123-cd', SHA), null);
});

test('photo signale les refus par des erreurs codées', async () => {
  await attendreErreur(creerClient(CONF, faux({ statut: 401, corps: {} })).photo('AB123CD', SHA), 'auth');
  await attendreErreur(creerClient(CONF, faux({ statut: 403, corps: {} })).photo('AB123CD', SHA), 'interdit');
  await attendreErreur(creerClient(CONF, faux(new Error('réseau'))).photo('AB123CD', SHA), 'reseau');
});

test('reclamerPhoto envoie l\'empreinte, la plaque et le dossier', async () => {
  const f = faux(ok({ ok: true, sha256: SHA, dossier: 'D1', deja: false }), { statut: 409, corps: { ok: false, dossier: 'D9' } }, { statut: 404, corps: { ok: false } });
  const c = creerClient(CONF, f);
  assert.deepEqual(await c.reclamerPhoto(SHA, 'ab-123-cd', 'D1'), { ok: true, deja: false });
  assert.deepEqual(JSON.parse(f.appels[0].init.body), { sha256: SHA, plaque: 'AB123CD', dossier: 'D1' });
  assert.equal(f.appels[0].init.method, 'POST');
  assert.deepEqual(await c.reclamerPhoto(SHA, 'AB123CD', 'D1'), { conflit: true, dossier: 'D9' });
  assert.deepEqual(await c.reclamerPhoto(SHA, 'AB123CD', 'D1'), { introuvable: true });
});

test('libererPhoto utilise DELETE avec l\'empreinte et le dossier', async () => {
  const f = faux(ok({ ok: true, sha256: SHA, libre: true }));
  assert.deepEqual(await creerClient(CONF, f).libererPhoto(SHA, 'D1'), { ok: true });
  assert.equal(f.appels[0].init.method, 'DELETE');
  assert.equal(f.appels[0].url, 'https://relais.example.test/api/photos?sha256=' + SHA + '&dossier=D1');
});

test('deposerPdf envoie le PDF en PUT et renvoie le lien de téléchargement et son expiration', async () => {
  const f = faux(ok({ ok: true, id: 'a'.repeat(64), expire: 1800000000000 }));
  const c = creerClient(CONF, f);
  const octets = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 1, 2]);
  const r = await c.deposerPdf('ab-123-cd', 'Entree AB.pdf', octets);
  assert.equal(f.appels[0].init.method, 'PUT');
  assert.equal(f.appels[0].url, 'https://relais.example.test/api/pdf?plaque=AB123CD&nom=Entree%20AB.pdf');
  assert.equal(f.appels[0].init.headers['Content-Type'], 'application/pdf');
  assert.equal(f.appels[0].init.body, octets);
  assert.equal(r.lien, 'https://relais.example.test/api/pdf?id=' + 'a'.repeat(64));
  assert.equal(r.expire, 1800000000000);
});

test('deposerPdf signale un PDF trop volumineux par une erreur codée', async () => {
  const c = creerClient(CONF, faux({ statut: 413, corps: { ok: false } }));
  await attendreErreur(c.deposerPdf('AB123CD', 'x.pdf', new Uint8Array(10)), 'volumineux');
  assert.match(messageErreur({ code: 'volumineux' }), /volumineux/i);
});

test('deposerPdf découpe un PDF de plus de 4 Mo en parties de 3 Mo, envoyées dans l\'ordre', async () => {
  const f = faux(ok({ ok: true, recue: 1 }), ok({ ok: true, recue: 2 }), ok({ ok: true, id: 'b'.repeat(64), expire: 1800000000000, taille: 7000000 }));
  const c = creerClient(CONF, f);
  const octets = new Uint8Array(7000000);
  octets.set([0x25, 0x50, 0x44, 0x46, 0x2D]);
  const r = await c.deposerPdf('AB123CD', 'Complet.pdf', octets);
  assert.equal(f.appels.length, 3);
  const q = f.appels.map((a) => new URL(a.url).searchParams);
  assert.deepEqual(q.map((p) => p.get('partie')), ['1', '2', '3']);
  assert.ok(q.every((p) => p.get('sur') === '3' && /^[0-9a-f]{32}$/.test(p.get('envoi')) && p.get('envoi') === q[0].get('envoi')));
  assert.deepEqual(f.appels.map((a) => a.init.body.length), [3000000, 3000000, 1000000]);
  assert.equal(r.lien, 'https://relais.example.test/api/pdf?id=' + 'b'.repeat(64));
  assert.equal(r.volumineux, true);
});

test('deposerPdf garde un seul envoi pour un PDF de 4 Mo ou moins', async () => {
  const f = faux(ok({ ok: true, id: 'c'.repeat(64), expire: 1 }));
  const r = await creerClient(CONF, f).deposerPdf('AB123CD', 'x.pdf', new Uint8Array(4000000));
  assert.equal(f.appels.length, 1);
  assert.equal(r.volumineux, false);
});

test('envoyerMailPdf demande au relais d\'envoyer le mail, avec ou sans pièce jointe', async () => {
  const f = faux(ok({ ok: true, envoye: true, joint: true }));
  const r = await creerClient(CONF, f).envoyerMailPdf('d'.repeat(64), 'client@example.test', true);
  assert.equal(f.appels[0].init.method, 'POST');
  assert.equal(f.appels[0].url, 'https://relais.example.test/api/pdf');
  assert.deepEqual(JSON.parse(f.appels[0].init.body), { id: 'd'.repeat(64), mail: 'client@example.test', joindre: true });
  assert.deepEqual(r, { envoye: true, joint: true });
});

test('envoyerMailPdf signale un relais sans service de mail (503) sans lever d\'erreur', async () => {
  const r = await creerClient(CONF, faux({ statut: 503, corps: { ok: false } })).envoyerMailPdf('d'.repeat(64), 'client@example.test', false);
  assert.deepEqual(r, { indisponible: true });
});

test('envoyerMailPdf signale une adresse refusée ou une panne du service de mail', async () => {
  await attendreErreur(creerClient(CONF, faux({ statut: 400, corps: { ok: false } })).envoyerMailPdf('d'.repeat(64), 'x', false), 'requete');
  await attendreErreur(creerClient(CONF, faux({ statut: 502, corps: { ok: false } })).envoyerMailPdf('d'.repeat(64), 'a@example.test', false), 'serveur');
});

test('resumeEnvoi dit ce qui a été envoyé, et précise la pièce jointe d\'un PDF volumineux', () => {
  const { resumeEnvoi } = require('../www/relais.js');
  assert.equal(resumeEnvoi({ mode: 'entree', mail: 'a@example.test', envoye: true, joint: false, taille: 1760000 }),
    'PDF d’entrée envoyé à a@example.test, avec le lien de téléchargement.');
  assert.equal(resumeEnvoi({ mode: 'full', mail: 'a@example.test', envoye: true, joint: true, taille: 7240000 }),
    'PDF complet envoyé à a@example.test. PDF volumineux (7,2 Mo) : il est joint au mail, en plus du lien.');
  assert.match(resumeEnvoi({ mode: 'entree', mail: 'a@example.test', indisponible: true, taille: 1000000 }), /service de mail/);
});

test('signalerSortie poste la plaque normalisée à /api/sortie', async () => {
  const f = faux(ok({ ok: true }));
  assert.deepEqual(await creerClient(CONF, f).signalerSortie('ab-123-cd'), { ok: true });
  assert.equal(f.appels[0].init.method, 'POST');
  assert.equal(f.appels[0].url, 'https://relais.example.test/api/sortie');
  assert.deepEqual(JSON.parse(f.appels[0].init.body), { plaque: 'AB123CD' });
});

test('annulerSortie supprime le marqueur par DELETE avec la plaque normalisée', async () => {
  const f = faux(ok({ ok: true }));
  assert.deepEqual(await creerClient(CONF, f).annulerSortie('ab-123-cd'), { ok: true });
  assert.equal(f.appels[0].init.method, 'DELETE');
  assert.equal(f.appels[0].url, 'https://relais.example.test/api/sortie?plaque=AB123CD');
});
