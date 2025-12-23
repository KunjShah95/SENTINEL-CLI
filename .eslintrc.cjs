module.exports = {
    env: {
        es2021: true,
        node: true,
        jest: true,
    },
    extends: ['eslint:recommended', 'prettier'],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
    },
    rules: {
        'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        indent: 'off',
        quotes: 'off',
    },
};
    