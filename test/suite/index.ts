import { once } from 'node:events';
import { glob } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import Mocha from 'mocha';

import { debugTimeout } from '../helpers.js';

const { CI } = process.env;
const reporter = CI === 'true' ? 'spec' : 'min';

async function run(): Promise<void> {
  const mocha = new Mocha({
    checkLeaks: true,
    color: true,
    inlineDiffs: true,
    reporter,
    timeout: debugTimeout(4000),
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
