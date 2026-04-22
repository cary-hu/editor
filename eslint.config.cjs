const globals = require('globals');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettierRecommended = require('eslint-plugin-prettier/recommended');
const tuiConfig = require('eslint-config-tui');

const sharedRules = {
  '@typescript-eslint/no-non-null-assertion': 0,
  '@typescript-eslint/explicit-function-return-type': 0,
  '@typescript-eslint/explicit-module-boundary-types': 0,
  '@typescript-eslint/no-explicit-any': 0,
  '@typescript-eslint/ban-types': 0,
  '@typescript-eslint/ban-ts-comment': 0,
  '@typescript-eslint/no-useless-constructor': 2,
  '@typescript-eslint/no-require-imports': 0,
  '@typescript-eslint/no-unsafe-function-type': 0,
  'lines-around-directive': 0,
  'newline-before-return': 0,
  'no-use-before-define': 0,
  'no-useless-constructor': 0,
  'padding-line-between-statements': [
    2,
    { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
    { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
  ],
  'no-useless-rename': 'error',
  'no-duplicate-imports': ['error', { includeExports: true }],
  'dot-notation': ['error', { allowKeywords: true }],
  'prefer-destructuring': [
    'error',
    {
      VariableDeclarator: {
        array: true,
        object: true,
      },
      AssignmentExpression: {
        array: false,
        object: false,
      },
    },
    {
      enforceForRenamedProperties: false,
    },
  ],
  'arrow-body-style': ['error', 'as-needed', { requireReturnForObjectLiteral: true }],
  'object-property-newline': ['error', { allowMultiplePropertiesPerLine: true }],
  'no-sync': 0,
  complexity: 0,
  'max-nested-callbacks': ['error', 4],
  'no-cond-assign': 0,
  'max-depth': ['error', 4],
  'no-return-assign': 0,
};

const toastmarkRules = {
  'prefer-destructuring': 0,
  'padding-line-between-statements': 0,
  'lines-between-class-members': 0,
  'no-undefined': 0,
  'no-console': 0,
  'no-useless-escape': 0,
  'no-shadow': 0,
  'no-plusplus': 0,
  'max-depth': 0,
  'no-warning-comments': 0,
  '@typescript-eslint/no-empty-function': 0,
  '@typescript-eslint/no-unused-vars': 0,
  'no-lonely-if': 0,
  'no-control-regex': 0,
  'no-nested-ternary': 0,
  'no-empty': 0,
  'dot-notation': 0,
  'spaced-comment': 0,
  eqeqeq: 0,
};

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/report/**',
      '**/tmpdoc/**',
      '**/.eslintrc.js',
    ],
  },
  ...tuiConfig,
  prettierRecommended,
  ...tsPlugin.configs['flat/recommended'],
  {
    files: ['**/*.{js,cjs,mjs,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
        vi: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: sharedRules,
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 0,
      '@typescript-eslint/no-unsafe-function-type': 0,
      'spaced-comment': 0,
    },
  },
  {
    files: [
      '**/*.config.js',
      '**/.eslintrc.js',
      'scripts/**/*.js',
      'app/scripts/**/*.js',
      'app/webpack.config.js',
    ],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 0,
      'no-implicit-globals': 0,
      'no-console': 0,
      'no-redeclare': 0,
      strict: 0,
    },
  },
  {
    files: ['app/examples/data/**/*.js'],
    rules: {
      '@typescript-eslint/no-unused-vars': 0,
    },
  },
  {
    files: ['**/__sample__/**/*.{js,cjs,mjs,ts,tsx}'],
    rules: {
      'no-new': 0,
      'no-console': 0,
    },
  },
  {
    files: ['libs/toastmark/**/*.{js,cjs,mjs,ts,tsx}'],
    rules: toastmarkRules,
  },
];
