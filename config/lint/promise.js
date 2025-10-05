/** https://github.com/eslint-community/eslint-plugin-promise */
export const promiseConfig = {
  rules: {
    /** https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/no-multiple-resolved.md */
    'promise/no-multiple-resolved': 'error',

    /** https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/prefer-await-to-callbacks.md */
    'promise/prefer-await-to-callbacks': 'error',

    /** https://github.com/eslint-community/eslint-plugin-promise/blob/main/docs/rules/prefer-await-to-then.md */
    'promise/prefer-await-to-then': 'error',
  },
};
