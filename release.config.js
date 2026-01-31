/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: ['main'],
  plugins: [
    '@semantic-release/commit-analyzer',

    '@semantic-release/release-notes-generator',
    ['@semantic-release/changelog'],

    [
      'semantic-release-vsce',
      {
        packageVsix: true,
        publish: false,
      },
    ],

    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'package-lock.json', 'CHANGELOG.md'],
        message:
          'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],

    [
      '@semantic-release/github',
      {
        assets: [{ label: 'Extension VSIX', path: '*.vsix' }],
      },
    ],
  ],
};
