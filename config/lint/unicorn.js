/** https://github.com/sindresorhus/eslint-plugin-unicorn */
export const unicornConfig = {
  rules: {
    /** https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/consistent-destructuring.md */
    'unicorn/consistent-destructuring': 'error',

    /** https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/custom-error-definition.md */
    'unicorn/custom-error-definition': 'error',

    /** https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-for-loop.md
     *
     * Covered by https://typescript-eslint.io/rules/prefer-for-of/
     */
    'unicorn/no-for-loop': 'off',

    /** https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-keyword-prefix.md */
    'unicorn/no-keyword-prefix': ['error', { checkProperties: false }],

    /** https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/no-process-exit.md
     * Covered by `eslint-plugin-n`.
     */
    'unicorn/no-process-exit': 'off',

    /** https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-event-target.md
     *
     * `EventTarget` makes no sense because the IDE extension isn't supposed to
     * be run via browser or Deno.
     */
    'unicorn/prefer-event-target': 'off',

    /** https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-json-parse-buffer.md */
    'unicorn/prefer-json-parse-buffer': 'error',

    /** https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-module.md */
    'unicorn/prefer-module': 'error',

    /** https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-top-level-await.md */
    'unicorn/prefer-top-level-await': 'error',

    /** https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/switch-case-braces.md
     *
     * Covered by https://eslint.org/docs/latest/rules/no-case-declarations
     */
    'unicorn/switch-case-braces': 'off',
  },
};
