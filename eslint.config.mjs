import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            '**/dist/**',
            '**/node_modules/**',
            '.aws-sam/**',
            'chinook/**',
        ],
    },
    {
        files: ['**/*.ts'],
        extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
        languageOptions: {
            globals: globals.node,
        },
    },
);
