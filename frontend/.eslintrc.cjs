module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    'eslint:recommended',
    'prettier'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    // Allow inline styles for CSS custom properties and data-driven values
    // Components can use style prop with @ts-ignore comments for dynamic theming
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      files: ['src/components/**/*.tsx'],
      rules: {
        // Inline styles are acceptable for CSS custom properties and dynamic values
        // marked with @ts-ignore comments
      },
    },
  ],
};
