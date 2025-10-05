/** https://github.com/import-js/eslint-plugin-import */
export const importConfig = {
  rules: {
    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/consistent-type-specifier-style.md */
    'import/consistent-type-specifier-style': ['error', 'prefer-top-level'],

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/dynamic-import-chunkname.md
     *
     * Turn it on if decide to use webpack.
     */
    'import/dynamic-import-chunkname': 'off',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/enforce-node-protocol-usage.md
     *
     * Covered by https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-node-protocol.md
     */
    'import/enforce-node-protocol-usage': 'off',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/exports-last.md */
    'import/exports-last': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/extensions.md */
    'import/extensions': ['error', { js: 'always', json: 'always' }],

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/first.md */
    'import/first': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/group-exports.md */
    'import/group-exports': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/max-dependencies.md */
    'import/max-dependencies': ['error', { ignoreTypeImports: true }],

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/newline-after-import.md */
    'import/newline-after-import': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-absolute-path.md */
    'import/no-absolute-path': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-amd.md */
    'import/no-amd': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-anonymous-default-export.md */
    'import/no-anonymous-default-export': [
      'error',
      {
        allowAnonymousClass: false,
        allowAnonymousFunction: false,
        allowArray: false,
        allowArrowFunction: false,
        allowCallExpression: true,
        allowLiteral: false,
        allowNew: false,
        allowObject: true,
      },
    ],

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-commonjs.md */
    'import/no-commonjs': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-cycle.md */
    'import/no-cycle': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-deprecated.md */
    'import/no-deprecated': 'warn',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-duplicates.md */
    'import/no-duplicates': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-dynamic-require.md */
    'import/no-dynamic-require': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-empty-named-blocks.md */
    'import/no-empty-named-blocks': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-extraneous-dependencies.md */
    'import/no-extraneous-dependencies': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-import-module-exports.md */
    'import/no-import-module-exports': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-internal-modules.md */
    'import/no-internal-modules': 'off',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-mutable-exports.md */
    'import/no-mutable-exports': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-named-as-default.md */
    'import/no-named-as-default': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-named-as-default-member.md */
    'import/no-named-as-default-member': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-namespace.md */
    'import/no-namespace': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-nodejs-modules.md */
    'import/no-nodejs-modules': 'off',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-relative-packages.md */
    'import/no-relative-packages': 'off',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-relative-parent-imports.md */
    'import/no-relative-parent-imports': 'off',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md */
    'import/no-restricted-paths': [
      'error',
      { zones: [{ from: './test', target: './src' }] },
    ],

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-self-import.md */
    'import/no-self-import': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-unassigned-import.md */
    'import/no-unassigned-import': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-unused-modules.md
     *
     * Turned off as it breaks the config.
     */
    'import/no-unused-modules': 'off',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-useless-path-segments.md */
    'import/no-useless-path-segments': 'error',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-webpack-loader-syntax.md
     *
     * Turn it on if decide to use webpack.
     */
    'import/no-webpack-loader-syntax': 'off',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/order.md
     *
     * Covered by https://perfectionist.dev/rules/sort-imports
     */
    'import/order': 'off',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/prefer-default-export.md */
    'import/prefer-default-export': 'off',

    /** https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/unambiguous.md */
    'import/unambiguous': 'error',
  },
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
      },
    },
  },
};
