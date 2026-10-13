const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', 'android/', 'www/vendor/'] },
  js.configs.recommended,
  {
    files: ['www/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser, Capacitor: 'readonly', pdfjsLib: 'readonly' } },
    rules: { eqeqeq: ['error', 'always', { null: 'ignore' }], 'no-var': 'off', 'no-unused-vars': ['error', { caughtErrors: 'none' }], 'no-control-regex': 'off', 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
  {
    files: ['www/js/**/*.js'],
    languageOptions: { sourceType: 'module' },
  },
  {
    files: ['relais/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    // Syntaxe ES des fonctions Vercel (compilée en CommonJS par Vercel).
    files: ['relais/api/**/*.js'],
    languageOptions: { sourceType: 'module' },
  },
  {
    files: ['www/utils.js', 'www/sauvegarde.js', 'www/nexptg.js', 'tests/**/*.js', 'scripts/**/*.js', '*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
];
