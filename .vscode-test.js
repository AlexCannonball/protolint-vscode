import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'test-compiled/suite/**/*.spec.js',
  installExtensions: ['zxh404.vscode-proto3'],
  label: 'All tests',
  mocha: {
    timeout: process.env.DEBUG_TIMEOUT,
    ui: 'bdd',
  },
  version: 'stable',
  workspaceFolder: './fixtures/multi_folder.code-workspace',
});
