import eslint from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import mochaPlugin from 'eslint-plugin-mocha';
import nodePlugin from 'eslint-plugin-n';
import perfectionist from 'eslint-plugin-perfectionist';
import pluginPromise from 'eslint-plugin-promise';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

import { esLintConfig } from './config/lint/eslint.js';
import { importConfig } from './config/lint/import.js';
import { nConfig } from './config/lint/n.js';
import { perfectionistRules } from './config/lint/perfectionist.js';
import { promiseConfig } from './config/lint/promise.js';
import { sonarConfig } from './config/lint/sonar.js';
import { stylisticConfig } from './config/lint/stylistic.js';
import { tseslintConfig } from './config/lint/typescript-eslint.js';
import { unicornConfig } from './config/lint/unicorn.js';

export default defineConfig(
  /** Completely ignored files */
  globalIgnores([
    './dist/**',
    './test-compiled/**',
    './**/node_modules/',
    './.vscode-test/**',
  ]),

  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
  },

  /** Core JS rules */
  eslint.configs.recommended,

  /** https://typescript-eslint.io/users/configs/#recommended-type-checked */
  ...tseslint.configs.recommendedTypeChecked,

  /** https://typescript-eslint.io/users/configs/#strict-type-checked */
  ...tseslint.configs.strictTypeChecked,

  /** https://typescript-eslint.io/users/configs/#stylistic-type-checked */
  ...tseslint.configs.stylisticTypeChecked,

  /** https://perfectionist.dev/configs/recommended-alphabetical */
  perfectionist.configs['recommended-alphabetical'],

  /** https://github.com/import-js/eslint-plugin-import */
  importPlugin.flatConfigs.recommended,

  /** https://github.com/sindresorhus/eslint-plugin-unicorn */
  unicorn.configs['recommended'],

  /** https://github.com/eslint-community/eslint-plugin-n */
  nodePlugin.configs['flat/recommended-module'],

  /** https://github.com/SonarSource/eslint-plugin-sonarjs */
  sonarjs.configs.recommended,

  /** https://github.com/eslint-community/eslint-plugin-promise */
  pluginPromise.configs['flat/recommended'],

  {
    extends: [
      importPlugin.flatConfigs.recommended,
      importPlugin.flatConfigs.typescript,
    ],
    files: ['./**/*.{cts,mts,ts}'],
  },

  {
    languageOptions: {
      ecmaVersion: 'latest',
      parserOptions: {
        ecmaVersion: 'latest',
        projectService: true,
        sourceType: 'module',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      ...esLintConfig.rules,
      ...tseslintConfig.rules,
      ...stylisticConfig.rules,
      ...perfectionistRules,
      ...sonarConfig.rules,
      ...unicornConfig.rules,
      ...nConfig.rules,
      ...promiseConfig.rules,
      ...importConfig.rules,
    },
  },

  {
    settings: {
      ...nConfig.settings,
      ...importConfig.settings,
    },
  },

  /** Disable some checks for JS files */
  {
    extends: [tseslint.configs.disableTypeChecked],
    files: ['./**/*.{cjs,js,mjs}'],
  },

  /** Customize checks for test files */
  {
    basePath: 'test',
    extends: [
      mochaPlugin.configs.recommended,
      {
        files: ['**/*.spec.ts'],
        rules: {
          ...tseslintConfig.testExceptions.rules,
          ...sonarConfig.testExceptions.rules,
        },
      },
      {
        files: ['helpers.ts'],
        ...tseslintConfig.testExceptions,
      },
    ],
  },

  /** Turns off all rules that are unnecessary or might conflict with Prettier */
  prettierConfig,
);
