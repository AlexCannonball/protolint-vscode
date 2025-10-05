/** https://github.com/SonarSource/SonarJS/blob/master/packages/jsts/src/rules/README.md */
export const sonarConfig = {
  rules: {
    /** https://sonarsource.github.io/rspec/#/rspec/S1481/javascript
     *
     * Covered by https://typescript-eslint.io/rules/no-unused-vars/
     */
    'sonarjs/no-unused-vars': 'off',

    /** https://sonarsource.github.io/rspec/#/rspec/S6594/javascript
     *
     * Covered by https://typescript-eslint.io/rules/prefer-regexp-exec/
     */
    'sonarjs/prefer-regexp-exec': 'off',

    /** https://sonarsource.github.io/rspec/#/rspec/S1128/javascript
     *
     * Covered by https://typescript-eslint.io/rules/no-unused-vars/
     */
    'sonarjs/unused-import': 'off',
  },
  testExceptions: {
    rules: {
      /** https://sonarsource.github.io/rspec/#/rspec/S2004/javascript
       *
       * As Mocha uses nested functions for structuring tests, the threshold
       * should be increased.
       */
      'sonarjs/no-nested-functions': ['error', { threshold: 6 }],
    },
  },
};
