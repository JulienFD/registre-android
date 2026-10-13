const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { creerCompte, lireComptes, verifierBasic } = require('../relais/lib/comptes.js');
const { recevoirNexptg } = require('../relais/lib/recevoir.js');

const fixture = (nom) => fs.readFileSync(path.join(__dirname, 'fixtures', nom), 'utf8');
const basic = (nom, mdp) => 'Basic ' + Buffer.from(nom + ':' + mdp).toString('base64');

const MDP = 'un-mot-de-passe-solide-42';
const COMPTES = lireComptes([creerCompte('julien', MDP), creerCompte('lea', 'autre-mot-de-passe-solide')].join(';'));
const NOW = 1791890000000;

function stockageMemoire() {
  const blobs = new Map();
  return {
    blobs,
    async ecrire(chemin, objet) {
      if (blobs.has(chemin)) return 'existe';
      blobs.set(chemin, objet);
      return 'cree';
    },
  };
}

function requete(extra) {
  const stockage = stockageMemoire();
  const base = {
    methode: 'POST', authorization: basic('julien', MDP), corps: fixture('nexptg-rapport-champ.json'),
    comptes: COMPTES, stockage, maintenant: () => NOW,
  };
  return { stockage, args: Object.assign(base, extra) };
}

// --- comptes ---

test('un compte créé est reconnu avec le bon mot de passe', () => {
  assert.equal(verifierBasic(basic('julien', MDP), COMPTES), 'julien');
  assert.equal(verifierBasic(basic('lea', 'autre-mot-de-passe-solide'), COMPTES), 'lea');
});

test('un mauvais mot de passe, un compte inconnu ou un en-tête invalide sont refusés', () => {
  assert.equal(verifierBasic(basic('julien', 'faux'), COMPTES), null);
  assert.equal(verifierBasic(basic('inconnu', MDP), COMPTES), null);
  assert.equal(verifierBasic(undefined, COMPTES), null);
  assert.equal(verifierBasic('Bearer abc', COMPTES), null);
  assert.equal(verifierBasic('Basic ???', COMPTES), null);
  assert.equal(verifierBasic('Basic ' + Buffer.from('sansdeuxpoints').toString('base64'), COMPTES), null);
});

test('un mot de passe contenant deux-points est accepté', () => {
  const comptes = lireComptes(creerCompte('tech', 'a:b:c:solide-et-long'));
  assert.equal(verifierBasic(basic('tech', 'a:b:c:solide-et-long'), comptes), 'tech');
});

test('on ne crée pas de compte au nom invalide ni au mot de passe trop court', () => {
  assert.throws(() => creerCompte('Julien Dupont', MDP), /Nom de compte invalide/);
  assert.throws(() => creerCompte('julien', 'court'), /trop court/);
});

test('une entrée de configuration mal formée est ignorée, jamais acceptée', () => {
  const comptes = lireComptes('julien:zz:yy;;pasdeseparateur');
  assert.equal(comptes.size, 0);
});

// --- réception ---

test('seule la méthode POST est acceptée', async () => {
  const { stockage, args } = requete({ methode: 'GET' });
  const r = await recevoirNexptg(args);
  assert.equal(r.statut, 405);
  assert.equal(r.entetes.Allow, 'POST');
  assert.equal(stockage.blobs.size, 0);
});

test('sans authentification valide, rien n\'est lu ni écrit', async () => {
  for (const authorization of [undefined, basic('julien', 'faux'), basic('inconnu', MDP)]) {
    const { stockage, args } = requete({ authorization });
    const r = await recevoirNexptg(args);
    assert.equal(r.statut, 401);
    assert.match(r.entetes['WWW-Authenticate'], /^Basic /);
    assert.deepEqual(r.json, { ok: false, erreur: 'authentification requise' });
    assert.equal(stockage.blobs.size, 0);
  }
});

test('un corps trop volumineux est refusé', async () => {
  const { stockage, args } = requete({ corps: 'x'.repeat(50), tailleMax: 10 });
  const r = await recevoirNexptg(args);
  assert.equal(r.statut, 413);
  assert.equal(stockage.blobs.size, 0);
});

test('un corps qui n\'est pas une synchro NexPTG est refusé sans écriture', async () => {
  for (const corps of ['pas du json', '{}', '[]']) {
    const { stockage, args } = requete({ corps });
    const r = await recevoirNexptg(args);
    assert.equal(r.statut, 422, corps);
    assert.equal(stockage.blobs.size, 0);
  }
});

test('un rapport est rangé par plaque avec son contenu d\'origine intact', async () => {
  const { stockage, args } = requete();
  const r = await recevoirNexptg(args);
  assert.equal(r.statut, 200);
  assert.deepEqual(r.json, { ok: true, rapports: 1, historique: 0 });
  assert.equal(stockage.blobs.size, 1);
  const [chemin, blob] = [...stockage.blobs][0];
  assert.match(chemin, /^rapports\/AB123CD\/[0-9a-f]{64}\.json$/);
  assert.equal(blob.par, 'julien');
  assert.equal(blob.recu, NOW);
  assert.equal(blob.plaque, 'AB123CD');
  assert.equal(blob.cle, '28409 Professional#1#1791887764');
  assert.deepEqual(blob.brut, JSON.parse(fixture('nexptg-rapport-champ.json')).data.reports[0]);
  assert.ok(chemin.endsWith(blob.sha256 + '.json'));
});

test('un rapport sans plaque est rangé à part, sans être perdu', async () => {
  const { stockage, args } = requete({ corps: fixture('nexptg-rapport.json') });
  const r = await recevoirNexptg(args);
  assert.equal(r.statut, 200);
  const [chemin, blob] = [...stockage.blobs][0];
  assert.match(chemin, /^rapports\/_sans-plaque\//);
  assert.ok(blob.avertissements.includes('plaque absente'));
});

test('une plaque aberrante ne peut pas altérer le chemin de stockage', async () => {
  const cas = [
    ['../../etc/passwd', /^rapports\/ETCPASSWD\/[0-9a-f]{64}\.json$/],
    ['A'.repeat(40), /^rapports\/_sans-plaque\/[0-9a-f]{64}\.json$/],
    ['///', /^rapports\/_sans-plaque\/[0-9a-f]{64}\.json$/],
  ];
  for (const [texte, attendu] of cas) {
    const brut = JSON.parse(fixture('nexptg-rapport-champ.json'));
    brut.data.reports[0].extraFields = [{ title: 'Immatriculation', text: texte, type: 0 }];
    const { stockage, args } = requete({ corps: JSON.stringify(brut) });
    await recevoirNexptg(args);
    const [chemin] = [...stockage.blobs][0];
    assert.match(chemin, attendu, texte);
  }
});

test('renvoyer le même rapport est sans effet (idempotent)', async () => {
  const { stockage, args } = requete();
  const a = await recevoirNexptg(args);
  const b = await recevoirNexptg(args);
  assert.equal(a.statut, 200);
  assert.equal(b.statut, 200);
  assert.equal(stockage.blobs.size, 1);
});

test('un rapport modifié puis resynchronisé est conservé comme nouvelle version', async () => {
  const { stockage, args } = requete();
  await recevoirNexptg(args);
  const brut = JSON.parse(fixture('nexptg-rapport-champ.json'));
  brut.data.reports[0].comment = 'Corrigé';
  await recevoirNexptg(Object.assign({}, args, { corps: JSON.stringify(brut) }));
  const chemins = [...stockage.blobs.keys()].filter((c) => c.startsWith('rapports/AB123CD/'));
  assert.equal(chemins.length, 2);
});

test('l\'historique des mesures libres est conservé, rangé par compte', async () => {
  const { stockage, args } = requete({ corps: fixture('nexptg-historique.json') });
  const r = await recevoirNexptg(args);
  assert.deepEqual(r.json, { ok: true, rapports: 0, historique: 1 });
  const [chemin, blob] = [...stockage.blobs][0];
  assert.match(chemin, /^historique\/julien\/[0-9a-f]{64}\.json$/);
  assert.deepEqual(blob.historique, JSON.parse(fixture('nexptg-historique.json')).data.history);
});

test('une synchro vide répond 200 sans rien écrire', async () => {
  const { stockage, args } = requete({ corps: fixture('nexptg-vide.json') });
  const r = await recevoirNexptg(args);
  assert.deepEqual(r.json, { ok: true, rapports: 0, historique: 0 });
  assert.equal(stockage.blobs.size, 0);
});

test('si le stockage échoue, la réponse est une erreur sans détail interne', async () => {
  const stockage = { async ecrire() { throw new Error('secret interne du fournisseur'); } };
  const { args } = requete({ stockage });
  const erreur = console.error;
  console.error = () => {};
  let r;
  try { r = await recevoirNexptg(args); } finally { console.error = erreur; }
  assert.equal(r.statut, 500);
  assert.deepEqual(r.json, { ok: false, erreur: 'stockage indisponible' });
});
