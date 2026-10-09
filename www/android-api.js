/* Pont Android : reproduit window.api (Electron) avec les plugins Capacitor. */
(function () {
  'use strict';
  var C = window.Capacitor;
  if (window.api || !C || !C.Plugins || !C.Plugins.Filesystem) return;
  var FS = C.Plugins.Filesystem, SH = C.Plugins.Share, UP = C.Plugins.Updater, DP = C.Plugins.Dossier, D = 'DATA', CA = 'CACHE';
  var base = null, fails = 0, lockUntil = 0, ID = /^[A-Za-z0-9_-]{1,120}$/;
  function okId(s) { return typeof s === 'string' && ID.test(s) }
  function b64(u8) { var s = '', n = 0x8000; for (var i = 0; i < u8.length; i += n)s += String.fromCharCode.apply(null, u8.subarray(i, i + n)); return btoa(s) }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2) }).join('') }
  function unhex(h) { var o = new Uint8Array(h.length / 2); for (var i = 0; i < o.length; i++)o[i] = parseInt(h.substr(i * 2, 2), 16); return o }
  async function wj(p, o) { await FS.writeFile({ path: p, data: JSON.stringify(o), directory: D, encoding: 'utf8', recursive: true }) }
  async function rj(p) { try { var r = await FS.readFile({ path: p, directory: D, encoding: 'utf8' }); return JSON.parse(r.data) } catch (e) { return null } }
  async function ls(p) { try { var r = await FS.readdir({ path: p, directory: D }); return r.files.map(function (f) { return typeof f === 'string' ? f : f.name }) } catch (e) { return [] } }
  async function rm(p) { try { await FS.deleteFile({ path: p, directory: D }) } catch (e) { } }
  async function ensureBase() {
    if (base) return;
    try { await FS.mkdir({ path: 'vehicules', directory: D, recursive: true }) } catch (e) { }
    var r = await FS.getUri({ path: 'vehicules', directory: D });
    base = r.uri.replace(/\/vehicules\/?$/, '');
  }
  function docPath(p) {
    var s = String(p).split('/');
    if (s[0] !== 'vehicules' || !okId(s[1])) throw new Error('chemin invalide');
    if (s.length === 2) return { file: 'vehicules/' + s[1] + '/dossier.json', kind: 'vehicule', id: s[1] };
    if (s.length === 4 && (s[2] === 'photos' || s[2] === 'compl') && okId(s[3])) return { file: 'vehicules/' + s[1] + '/' + s[2] + '/' + s[3] + '.json', kind: s[2], id: s[1], sub: s[3] };
    throw new Error('chemin invalide');
  }
  async function readDir(dir) {
    var out = {}, names = await ls(dir);
    for (var i = 0; i < names.length; i++) { if (!/\.json$/.test(names[i])) continue; var d = await rj(dir + '/' + names[i]); if (d) out[names[i].slice(0, -5)] = d }
    return out;
  }
  function pick(accept, multiple) {
    return new Promise(function (res) {
      var i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = !!multiple; i.style.display = 'none';
      document.body.appendChild(i);
      var done = false; function fin(v) { if (done) return; done = true; i.remove(); res(v) }
      i.addEventListener('change', function () { fin(Array.prototype.slice.call(i.files || [])) });
      i.addEventListener('cancel', function () { fin([]) });
      i.click();
    });
  }
  async function shareBytes(name, bytes) {
    var safe = String(name).replace(/[^A-Za-z0-9._-]/g, '_');
    await FS.writeFile({ path: 'partage/' + safe, data: b64(bytes), directory: CA, recursive: true });
    var u = await FS.getUri({ path: 'partage/' + safe, directory: CA });
    await SH.share({ title: safe, url: u.uri, dialogTitle: 'Enregistrer ou envoyer : ' + safe });
  }
  async function readBytes(path) { var r = await FS.readFile({ path: path, directory: D }); var s = atob(r.data), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++)u[i] = s.charCodeAt(i); return u }
  /* PIN */
  async function hashPin(pin, saltHex) {
    var k = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: 150000 }, k, 256));
  }
  async function cfg() { return (await rj('config.json')) || {} }
  async function verify(pin) {
    var c = await cfg(); if (!c.pin) return { ok: false, none: true };
    if (Date.now() < lockUntil) return { ok: false, wait: Math.ceil((lockUntil - Date.now()) / 1000) };
    var h = await hashPin(pin, c.pin.salt);
    if (h === c.pin.hash) { fails = 0; return { ok: true } }
    fails++; if (fails >= 5) { fails = 0; lockUntil = Date.now() + 60000; return { ok: false, wait: 60 } }
    return { ok: false, left: 5 - fails };
  }
  async function newPinRec(pin) { var salt = hex(crypto.getRandomValues(new Uint8Array(16))); return { salt: salt, hash: await hashPin(pin, salt) } }
  var PINRE = /^\d{4,8}$/;
  /* archives */
  async function sha256(u8) { return hex(await crypto.subtle.digest('SHA-256', u8)) }
  window.api = {
    loadAll: async function () {
      await ensureBase();
      var all = { vehicules: {}, photos: {}, compl: {} }, ids = await ls('vehicules');
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i]; if (!okId(id)) continue;
        var d = await rj('vehicules/' + id + '/dossier.json'); if (!d) continue;
        all.vehicules[id] = d; all.photos[id] = await readDir('vehicules/' + id + '/photos'); all.compl[id] = await readDir('vehicules/' + id + '/compl');
      }
      return all;
    },
    write: async function (p, data) { var t = docPath(p); await wj(t.file, data); return true },
    del: async function (p) {
      var t = docPath(p);
      if (t.kind === 'vehicule') { try { await FS.rmdir({ path: 'vehicules/' + t.id, directory: D, recursive: true }) } catch (e) { } return true }
      await rm(t.file);
      if (t.kind === 'photos') { await rm('vehicules/' + t.id + '/photos/' + t.sub + '.jpg'); await rm('vehicules/' + t.id + '/photos/' + t.sub + '.pdf') }
      return true;
    },
    savePhoto: async function (id, pid, bytes) {
      if (!okId(id) || !okId(pid)) throw new Error('identifiant invalide');
      await FS.writeFile({ path: 'vehicules/' + id + '/photos/' + pid + '.jpg', data: b64(bytes), directory: D, recursive: true }); return true;
    },
    addPdf: async function (id, pid) {
      if (!okId(id) || !okId(pid)) throw new Error('identifiant invalide');
      var f = (await pick('application/pdf,.pdf', false))[0]; if (!f) return null;
      var u8 = new Uint8Array(await f.arrayBuffer());
      await FS.writeFile({ path: 'vehicules/' + id + '/photos/' + pid + '.pdf', data: b64(u8), directory: D, recursive: true });
      return f.name;
    },
    importImages: async function () {
      var fs = (await pick('image/*', true)).slice(0, 30), out = [];
      for (var i = 0; i < fs.length; i++)out.push({ name: fs[i].name, bytes: new Uint8Array(await fs[i].arrayBuffer()) });
      return out;
    },
    photoUrl: function (p) {
      if (!base) return '';
      return C.convertFileSrc(base + '/vehicules/' + p.vid + '/photos/' + (p.file || p.id) + (p.kind === 'pdf' ? '.pdf' : '.jpg'));
    },
    openPdf: async function (p) {
      try { await shareBytes((p.label || 'analyse') + '.pdf', await readBytes('vehicules/' + p.vid + '/photos/' + (p.file || p.id) + '.pdf')) } catch (e) { }
      return true;
    },
    archive: async function (o) {
      var safe = String(o.name || 'document.pdf').replace(/[^A-Za-z0-9._-]/g, '_');
      var dir = 'archives/' + (o.sub === 'Entrees' ? 'Entrees' : 'Dossiers') + '/' + new Date().getFullYear();
      var rel = dir + '/' + safe, exists = false;
      try { await FS.stat({ path: rel, directory: D }); exists = true } catch (e) { }
      if (exists) { var ext = safe.slice(safe.lastIndexOf('.')); rel = dir + '/' + safe.slice(0, safe.length - ext.length) + '_' + Date.now() + ext }
      var u8 = o.bytes instanceof Uint8Array ? o.bytes : new Uint8Array(o.bytes);
      await FS.writeFile({ path: rel, data: b64(u8), directory: D, recursive: true });
      var sha = await sha256(u8), log = 'archives/REGISTRE-INTEGRITE.csv', txt = 'date;fichier;sha256;chaine\n', prev = '0';
      try { var r = await FS.readFile({ path: log, directory: D, encoding: 'utf8' }); txt = r.data; var ln = txt.trim().split(/\r?\n/); var last = ln[ln.length - 1].split(';'); if (ln.length > 1 && last[3]) prev = last[3] } catch (e) { }
      var when = new Date().toISOString(), chain = await sha256(new TextEncoder().encode(prev + when + rel + sha));
      await FS.writeFile({ path: log, data: txt + [when, rel, sha, chain].join(';') + '\n', directory: D, encoding: 'utf8', recursive: true });
      return { path: rel, rel: rel, sha256: sha };
    },
    openFile: async function (p) {
      try { await shareBytes(String(p).split('/').pop(), await readBytes(p)) } catch (e) { }
      return true;
    },
    reveal: async function (p) { return window.api.openFile(p) },
    openArchive: async function () {
      try { var r = await FS.readFile({ path: 'archives/REGISTRE-INTEGRITE.csv', directory: D }); var s = atob(r.data), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++)u[i] = s.charCodeAt(i); await shareBytes('REGISTRE-INTEGRITE.csv', u) } catch (e) { }
      return true;
    },
    pinStatus: async function () { return { set: !!(await cfg()).pin } },
    pinSet: async function (pin) {
      var c = await cfg(); if (c.pin) return { ok: false, error: 'déjà défini' };
      if (!PINRE.test(String(pin))) return { ok: false, error: 'Le code doit comporter de 4 à 8 chiffres' };
      c.pin = await newPinRec(pin); await wj('config.json', c); return { ok: true };
    },
    pinVerify: verify,
    pinChange: async function (o, n) {
      var v = await verify(o); if (!v.ok) return v;
      if (!PINRE.test(String(n))) return { ok: false, error: 'Le code doit comporter de 4 à 8 chiffres' };
      var c = await cfg(); c.pin = await newPinRec(n); await wj('config.json', c); return { ok: true };
    },
    copieDossier: async function () { return (await cfg()).copie || null },
    chooseCopie: async function (pin) {
      var v = await verify(pin); if (!v.ok) return v;
      var r; try { r = await DP.choisir() } catch (e) { return { ok: false, annule: true } }
      var c = await cfg(); c.copie = { uri: r.uri, nom: r.nom }; await wj('config.json', c); return { ok: true };
    },
    removeCopie: async function (pin) {
      var v = await verify(pin); if (!v.ok) return v;
      var c = await cfg(); if (c.copie) { try { await DP.oublier({ arbre: c.copie.uri }) } catch (e) { } delete c.copie; await wj('config.json', c) }
      return { ok: true };
    },
    /* Écrit un PDF dans le sous-dossier de la fiche ; renvoie null si aucun dossier de copie n'est choisi. */
    copier: async function (o) {
      var c = (await cfg()).copie; if (!c) return null;
      var u8 = o.bytes instanceof Uint8Array ? o.bytes : new Uint8Array(o.bytes);
      return DP.ecrire({ arbre: c.uri, dossier: o.dossier, nom: o.nom, data: b64(u8), ecraser: !!o.ecraser });
    },
    settings: async function () { return { copie: (await cfg()).copie || null, dataDir: 'Mémoire privée de l’application (tablette)', archiveDir: 'Archives dans l’application. Les boutons « PDF » ouvrent le partage Android pour les enregistrer sur Google Drive.', version: (await UP.getVersion()).versionName, pinSet: !!(await cfg()).pin } },
    appVersion: async function () { return (await UP.getVersion()).versionName },
    installUpdate: function (url) { return UP.install({ url: url }) },
    chooseArchive: async function (pin) { var v = await verify(pin); if (!v.ok) return v; return { ok: true, archiveDir: 'archives' } }
  };
})();
