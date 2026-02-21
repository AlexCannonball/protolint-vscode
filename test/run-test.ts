import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

import type { TestOptions } from '@vscode/test-electron';

const { runTests, runVSCodeCommand } = createRequire(import.meta.url)(
  '@vscode/test-electron',
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
) as typeof import('@vscode/test-electron');

async function main() {
  try {
    const { stdout } = await runVSCodeCommand(['--list-extensions']);
    const extensions = stdout.split('\n');

    if (!extensions.includes('zxh404.vscode-proto3')) {
      await runVSCodeCommand(['--install-extension', 'zxh404.vscode-proto3']);
    }

    const options: TestOptions = {
      extensionDevelopmentPath: path.resolve(import.meta.dirname, '..'),
      extensionTestsPath: path.resolve(import.meta.dirname, 'suite/index.js'),
      launchArgs: [
        path.resolve(
          import.meta.dirname,
          '../fixtures/multi_folder.code-workspace',
        ),
      ],
    };

    // Download VS Code, unzip it and run the integration test
    await runTests(options);
  } catch {
    process.exitCode = 1;
  }
}

await main();
