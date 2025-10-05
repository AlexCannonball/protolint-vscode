import { once } from 'node:events';
import { glob } from 'node:fs/promises';
import path from 'node:path';

import Mocha from 'mocha';

import { DEBUG_TIMEOUT } from '../helpers.js';

async function run(): Promise<void> {
  const mocha = new Mocha({
    checkLeaks: true,
    color: true,
    inlineDiffs: true,
    reporter: 'min', // use 'spec' for a detailed test report
    timeout: DEBUG_TIMEOUT,
    ui: 'bdd',
  });

  const testSuitesRoot = import.meta.dirname;

  for await (const { name, parentPath } of glob('**/**.spec.js', {
    cwd: testSuitesRoot,
    withFileTypes: true,
  })) {
    mocha.files.push(path.join(parentPath, name));
  }

  await mocha.loadFilesAsync();

  const runner = mocha.run();

  await once(runner, Mocha.Runner.constants.EVENT_RUN_END);

  if (runner.failures) {
    throw new Error(`${runner.failures.toString()} tests failed.`);
  }
}

export { run };
