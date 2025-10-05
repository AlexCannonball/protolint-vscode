/** https://eslint.style */
export const stylisticConfig = {
  rules: {
    /** https://eslint.style/rules/default/padding-line-between-statements */
    '@stylistic/padding-line-between-statements': [
      'error',
      { blankLine: 'always', next: 'return', prev: '*' },
      { blankLine: 'always', next: '*', prev: ['const', 'let', 'var'] },
      {
        blankLine: 'any',
        next: ['const', 'let', 'var'],
        prev: ['const', 'let', 'var'],
      },
      { blankLine: 'always', next: ['interface', 'type'], prev: '*' },
    ],

    /** https://eslint.style/rules/default/spaced-comment */
    '@stylistic/spaced-comment': 'error',
  },
};
