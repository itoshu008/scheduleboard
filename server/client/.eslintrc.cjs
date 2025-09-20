module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 12,
    sourceType: 'module',
  },
  plugins: [
    'react',
    '@typescript-eslint',
  ],
  rules: {
    // 他のrules...
    'no-restricted-syntax': [
      'error',
      {
        selector:
          "Literal[value=/^https?:\\\\/\\\\/(127\\\\.0\\\\.0\\\\.1|localhost|162\\\\.43\\\\.86\\\\.239|zatint1991\\\\.com)\\\\/api/]",
        message:
          "API の直URL禁止。'/api' を使い、src/lib/api.ts のクライアント経由に統一してください。",
      },
    ],
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
};
