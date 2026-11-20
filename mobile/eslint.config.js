const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  {
    ignores: ['.expo/**', 'dist/**', 'web-build/**', 'coverage/**', 'ios/**', 'android/**'],
  },
  expoConfig,
  {
    // Adoption progressive des diagnostics React Compiler dans le code existant.
    // Ils restent visibles ; react-hooks/rules-of-hooks reste une erreur.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
]);
