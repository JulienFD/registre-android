// Échoue si la version de package.json n'est pas strictement supérieure aux tags vX.Y.Z existants.
const { execFileSync } = require('node:child_process');
const { verifierVersion } = require('../www/utils.js');
const { version } = require('../package.json');

const tags = execFileSync('git', ['tag', '--list', 'v*'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const r = verifierVersion(version, tags);
if (!r.ok) { console.error(r.erreur); process.exit(1); }
console.log('Version ' + version + ' valide.');
