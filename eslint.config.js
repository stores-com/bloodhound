const globals = require('globals');
const js = require('@eslint/js');

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.node
            },
            sourceType: 'commonjs'
        },
        rules: {
            'brace-style': ['error', '1tbs', { allowSingleLine: true }],
            'comma-dangle': 'error',
            'dot-notation': 'error',
            'indent': ['error', 4, { 'SwitchCase': 1 }],
            'linebreak-style': 'error',
            'no-console': 'error',
            'no-inline-comments': 'error',
            'no-trailing-spaces': 'error',
            'no-unused-vars': ['error', { 'caughtErrors': 'none' }],
            'object-curly-spacing': ['error', 'always'],
            'quotes': ['error', 'single'],
            semi: ['error', 'always'],
            'space-before-function-paren': ['error', {
                anonymous: 'never',
                named: 'never',
                asyncArrow: 'always'
            }]
        }
    }
];
