/* eslint-disable no-console */
import { rm } from 'node:fs/promises';
import process from 'node:process';

import esbuild from 'esbuild';

import packageJson from './package.json' with { type: 'json' };

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const {
  contributes: { commands },
  name,
  publisher,
} = packageJson;

const [
  { command: cmdLint } = { command: 'protolint.editorLint' },
  { command: cmdAutofix } = { command: 'protolint.editorAutofix' },
] = commands;

const esbuildProblemMatcherPlugin: esbuild.Plugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      for (const { location, text } of result.errors) {
        console.error(`✘ [ERROR] ${text}`);

        if (location) {
          console.error(
            `    ${location.file}:${location.line.toString()}:${location.column.toString()}:`,
          );
        }
      }
      console.log('[watch] build finished');
    });
  },
};

const sharedOptions: esbuild.BuildOptions = {
  define: {
    __CMD_AUTOFIX__: JSON.stringify(cmdAutofix),
    __CMD_LINT__: JSON.stringify(cmdLint),
    __EXT_NAME__: JSON.stringify(name),
    __EXT_PUBLISHER__: JSON.stringify(publisher),
  },
  format: 'esm',
  platform: 'node',
  plugins: [
    /* add to the end of plugins array */
    esbuildProblemMatcherPlugin,
  ],
  sourcesContent: false,
  target: ['node24'],
};

const developmentOptions: esbuild.BuildOptions = {
  entryPoints: ['src/**/*.ts'],
  sourcemap: true,
};

const productionOptions: esbuild.BuildOptions = {
  bundle: true,
  entryPoints: ['src/extension.ts'],
  external: ['vscode'],
  minify: true,
};

const extensionOptions = production ? productionOptions : developmentOptions;

async function main() {
  if (!watch) {
    console.log('[clean] Removing old build artifacts...');
    const foldersToClean = ['./dist', './test-compiled'];

    for (const folder of foldersToClean) {
      await rm(folder, { force: true, recursive: true });
    }
  }

  const extensionContext = await esbuild.context({
    ...sharedOptions,
    ...extensionOptions,
    outbase: 'src',
    outdir: 'dist',
  });

  const testsContext = production
    ? undefined
    : await esbuild.context({
        ...sharedOptions,
        entryPoints: [
          'test/*.ts',
          'test/suite/index.ts',
          'test/suite/**/*.spec.ts',
        ],
        outbase: 'test',
        outdir: 'test-compiled',
        sourcemap: true,
      });

  if (watch) {
    await Promise.all([extensionContext.watch(), testsContext?.watch()]);

    return;
  }

  await Promise.all([extensionContext.rebuild(), testsContext?.rebuild()]);
  await Promise.all([extensionContext.dispose(), testsContext?.dispose()]);
}

await main();
