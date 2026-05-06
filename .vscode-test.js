import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'test-compiled/suite/**/*.spec.js',
  installExtensions: ['zxh404.vscode-proto3'],
  label: 'All tests',
  mocha: {
    timeout: 4000,
    ui: 'bdd',
  },
  version: 'stable',
  workspaceFolder: './fixtures/multi_folder.code-workspace',
});
