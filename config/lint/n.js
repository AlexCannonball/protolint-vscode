/** https://github.com/eslint-community/eslint-plugin-n */
export const nConfig = {
  rules: {
    /** https://github.com/eslint-community/eslint-plugin-n/blob/HEAD/docs/rules/no-missing-import.md
     *
     * Covered by TypeScript and https://github.com/import-js/eslint-plugin-import/blob/v2.31.0/docs/rules/no-unresolved.md
     */
    'n/no-missing-import': 'off',

    /** https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/no-unpublished-import.md
     *
     * This doesn't make sense for VS Code Extension as it's not published via
     * `npm publish`.
     */
    'n/no-unpublished-import': 'off',

    /** https://github.com/eslint-community/eslint-plugin-n/blob/HEAD/docs/rules/no-unpublished-require.md
     *
     * This doesn't make sense for VS Code Extension as it's not published via
     * `npm publish`.
     */
    'n/no-unpublished-require': 'off',

    /** https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/prefer-global/buffer.md */
    'n/prefer-global/buffer': ['error', 'never'],

    /** https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/prefer-global/console.md */
    'n/prefer-global/console': ['error', 'always'],

    /** https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/prefer-global/process.md */
    'n/prefer-global/process': ['error', 'never'],

    /** https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/prefer-global/text-decoder.md */
    'n/prefer-global/text-decoder': ['error', 'always'],

    /** https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/prefer-global/text-encoder.md */
    'n/prefer-global/text-encoder': ['error', 'always'],

    /** https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/prefer-global/url.md */
    'n/prefer-global/url': ['error', 'always'],

    /** https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/prefer-global/url-search-params.md */
    'n/prefer-global/url-search-params': ['error', 'always'],

    /** https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/prefer-promises/fs.md */
    'n/prefer-promises/fs': 'error',

    /** https://github.com/eslint-community/eslint-plugin-n/blob/master/docs/rules/no-sync.md */
    'no-sync': 'error',
  },
  settings: {
    node: {
      allowModules: ['vscode'],
    },
  },
};
