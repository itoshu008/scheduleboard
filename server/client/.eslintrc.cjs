// .eslintrc.cjs  — CRA(react-scripts 5) 向けの最小設定
// 依存衝突を避けるため、parser や plugin の指定はせず、
// CRA 同梱の eslint-config-react-app を拡張します。

module.exports = {
  root: true,
  extends: ['react-app', 'react-app/jest'],

  env: {
    browser: true,
    es2021: true,
    node: true,
  },

  settings: {
    react: { version: 'detect' },
  },

  ignorePatterns: [
    'node_modules/',
    'build/',
    'dist/',
    'public/',
  ],

  rules: {
    // 空ブロックは警告に（catch は許容）
    'no-empty': ['warn', { allowEmptyCatch: true }],

    // 再代入しない let を警告
    'prefer-const': 'warn',

    // 10 など自明なリテラルへの型注釈を許容
    '@typescript-eslint/no-inferrable-types': 'off',

    // 開発中のログは許容
    'no-console': 'off',
  },

  overrides: [
    {
      files: ['**/*.test.{js,jsx,ts,tsx}'],
      env: { jest: true },
    },
  ],
};
