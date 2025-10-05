import path from 'node:path';

import { listFiles } from '@vscode/vsce';
import { expect } from 'chai';

import package_ from '../../package.json' with { type: 'json' };
import { debugTimeout, PROJECT_ROOT } from '../helpers.js';

const { icon, main } = package_;

describe(`'.vscodeignore' and package files`, function () {
  let actualFiles: string[];
  const licenseFile = 'LICENSE.md';
  const mandatoryFiles = new Set([
    icon,
    licenseFile,
    main,
    'package.json',
    'README.md',
  ]);

  before(`Initialize API-s and parameters`, async function () {
    this.timeout(debugTimeout(15_000));

    actualFiles = await listFiles({ cwd: PROJECT_ROOT });
    expect(actualFiles, `The extension package must not be empty`).to.be.an(
      'array',
    ).that.is.not.empty;
  });

  it(`the license file should be included`, function () {
    expect(
      actualFiles,
      `The extension package must include the license file '${licenseFile}'`,
    ).to.include(licenseFile);
  });

  it(`'main' application file should be included`, function () {
    expect(
      actualFiles,
      `The extension package must include the primary entry file '${main}'`,
    ).to.include(main);
  });

  it(`'icon' file should be included`, function () {
    expect(
      actualFiles,
      `The extension package must include the icon file '${icon}'`,
    ).to.include(icon);
  });

  it(`files with undesired extensions should not be included`, function () {
    const undesiredExtensions = [
      '.code-workspace',
      '.json',
      '.cts',
      '.mts',
      '.ts',
      '.map',
      '.proto',
      '.tsbuildinfo',
      '.vsix',
      '.yaml',
      '.yml',
    ];
    const fileExtensions = new Set(
      actualFiles
        .filter((file) => !mandatoryFiles.has(file))
        .map((file) => path.extname(file).toLowerCase()),
    );

    expect(
      fileExtensions,
      `The extension package must not include files with undesired extensions'`,
    ).to.not.have.any.keys(undesiredExtensions);
  });
});
