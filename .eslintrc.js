module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  rules: {
    // Turn off annoying rules
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-namespace': 'off',
    '@typescript-eslint/ban-types': 'off',
    
    // Keep only the helpful ones
    'no-console': 'off', // Allow console.log
    'no-debugger': 'warn', // Warn about debugger
    'no-duplicate-imports': 'error', // Prevent duplicate imports
    'no-useless-catch': 'off',
    'prefer-const': 'off',
  },
  env: {
    node: true,
    es6: true,
  },
  overrides: [
    {
      // WAPI JavaScript files
      files: ['src/lib/**/*.js'],
      parser: '@babel/eslint-parser',
      parserOptions: {
        ecmaVersion: 6,
        sourceType: 'module',
        requireConfigFile: false,
      },
      env: {
        browser: true,
        es6: true,
      },
      globals: {
        axios: true,
        Debug: true,
        Store: true,
        WAPI: true,
        WPP: true,
        webpackJsonp: true,
        WWebJS: true,
      },
    },
  ],
};