/** https://github.com/azat-io/eslint-plugin-perfectionist */
export const perfectionistRules = {
  /** https://perfectionist.dev/rules/sort-imports */
  'perfectionist/sort-imports': [
    'error',
    {
      groups: [
        'builtin',
        'external',
        'internal',
        'parent',
        'sibling',
        'index',
        'object',
        'builtin-type',
        'external-type',
        'internal-type',
        'parent-type',
        'sibling-type',
        'index-type',
      ],
    },
  ],
};
