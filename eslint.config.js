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
    files: ['www/utils.js', 'tests/**/*.js', '*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
];
