module.exports = [{
  files: ['**/*.ts','**/*.tsx'],
  ignores: ['dist/**','dist-electron/**','release/**','node_modules/**'],
  languageOptions: { parser: require('@typescript-eslint/parser'), parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } }, globals: { window: 'readonly', document: 'readonly', console: 'readonly', process: 'readonly' } },
  plugins: { '@typescript-eslint': require('@typescript-eslint/eslint-plugin') },
  rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-unused-vars': ['error',{argsIgnorePattern:'^_'}] }
}];
