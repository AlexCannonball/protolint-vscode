/** https://typescript-eslint.io/ */
export const tseslintConfig = {
  rules: {
    /** https://typescript-eslint.io/rules/consistent-type-exports */
    '@typescript-eslint/consistent-type-exports': 'error',

    /** https://typescript-eslint.io/rules/consistent-type-imports */
    '@typescript-eslint/consistent-type-imports': 'error',

    /** https://typescript-eslint.io/rules/default-param-last */
    '@typescript-eslint/default-param-last': 'error',

    /** https://typescript-eslint.io/rules/explicit-module-boundary-types */
    '@typescript-eslint/explicit-module-boundary-types': 'error',

    /** https://typescript-eslint.io/rules/member-ordering
     *
     * Covered by https://perfectionist.dev/rules/sort-classes
     */
    '@typescript-eslint/member-ordering': 'off',

    /** https://typescript-eslint.io/rules/method-signature-style */
    '@typescript-eslint/method-signature-style': 'error',

    /** https://typescript-eslint.io/rules/naming-convention */
    '@typescript-eslint/naming-convention': [
      'error',
      {
        format: ['PascalCase'],
        leadingUnderscore: 'forbid',
        prefix: ['I'],
        selector: 'interface',
        trailingUnderscore: 'forbid',
      },
      {
        format: ['PascalCase'],
        leadingUnderscore: 'forbid',
        prefix: ['T'],
        selector: 'typeAlias',
        trailingUnderscore: 'forbid',
      },
      {
        format: ['PascalCase'],
        leadingUnderscore: 'allow',
        selector: 'typeParameter',
        trailingUnderscore: 'forbid',
      },
      {
        format: ['PascalCase'],
        leadingUnderscore: 'forbid',
        selector: ['class', 'enum', 'enumMember'],
        trailingUnderscore: 'forbid',
      },
      {
        format: ['camelCase'],
        leadingUnderscore: 'allow',
        selector: ['function', 'parameter'],
        trailingUnderscore: 'allow',
      },
      {
        format: ['camelCase', 'UPPER_CASE'],
        leadingUnderscore: 'allow',
        selector: 'variable',
        trailingUnderscore: 'allow',
      },
      {
        format: ['UPPER_CASE'],
        leadingUnderscore: 'allow',
        modifiers: ['global', 'const', 'exported'],
        selector: 'variable',
        trailingUnderscore: 'forbid',
        types: ['array', 'boolean', 'number', 'string'],
      },
      {
        format: ['camelCase'],
        leadingUnderscore: 'require',
        modifiers: ['private'],
        selector: 'memberLike',
      },
    ],

    /** https://typescript-eslint.io/rules/no-confusing-void-expression */
    '@typescript-eslint/no-confusing-void-expression': [
      'error',
      { ignoreArrowShorthand: true },
    ],

    /** https://typescript-eslint.io/rules/no-loop-func */
    '@typescript-eslint/no-loop-func': 'error',

    /** https://typescript-eslint.io/rules/no-shadow */
    '@typescript-eslint/no-shadow': 'error',

    /** https://typescript-eslint.io/rules/no-unnecessary-qualifier */
    '@typescript-eslint/no-unnecessary-qualifier': 'error',

    /** https://typescript-eslint.io/rules/no-unnecessary-type-conversion */
    '@typescript-eslint/no-unnecessary-type-conversion': 'error',

    /** https://typescript-eslint.io/rules/no-unused-vars */
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],

    /** https://typescript-eslint.io/rules/no-useless-empty-export */
    '@typescript-eslint/no-useless-empty-export': 'error',

    /** https://typescript-eslint.io/rules/prefer-destructuring */
    '@typescript-eslint/prefer-destructuring': 'error',

    /** https://typescript-eslint.io/rules/prefer-find
     *
     * Covered by https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-array-find.md
     */
    '@typescript-eslint/prefer-find': 'off',

    /** https://typescript-eslint.io/rules/prefer-readonly */
    '@typescript-eslint/prefer-readonly': 'error',

    /** https://typescript-eslint.io/rules/promise-function-async */
    '@typescript-eslint/promise-function-async': 'error',

    /** https://typescript-eslint.io/rules/require-array-sort-compare
     *
     * Covered by https://sonarsource.github.io/rspec/#/rspec/S2871/javascript
     */
    '@typescript-eslint/require-array-sort-compare': 'off',

    /** https://typescript-eslint.io/rules/restrict-template-expressions */
    '@typescript-eslint/restrict-template-expressions': 'error',

    /** https://typescript-eslint.io/rules/strict-boolean-expressions */
    '@typescript-eslint/strict-boolean-expressions': 'error',

    /** https://typescript-eslint.io/rules/switch-exhaustiveness-check */
    '@typescript-eslint/switch-exhaustiveness-check': 'error',

    /** https://typescript-eslint.io/rules/default-param-last */
    'default-param-last': 'off',

    /** https://typescript-eslint.io/rules/no-loop-func */
    'no-loop-func': 'off',

    /** https://typescript-eslint.io/rules/no-shadow */
    'no-shadow': 'off',

    /** https://typescript-eslint.io/rules/no-unused-vars */
    'no-unused-vars': 'off',

    /** https://typescript-eslint.io/rules/prefer-destructuring */
    'prefer-destructuring': 'off',
  },
  /** Disable some checks for test files */
  testExceptions: {
    rules: {
      /** https://typescript-eslint.io/rules/no-unused-expressions */
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
};
