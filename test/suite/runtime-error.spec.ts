import { expect } from 'chai';
import { Uri, window, workspace } from 'vscode';

import { RUNTIME_ERROR_CODE } from '../../dist/constants.js';
import {
  appendWorkspaceFolders,
  closeDocuments,
  debugTimeout,
  FIXTURES_DIRECTORY,
  getDiagnosticCodes,
  getTargetDiagnostics,
  resetCommandConfig,
  resetWorkspaceFolders,
} from '../helpers.js';

import type { TextDocument } from 'vscode';

const RUNTIME_ERROR_DIRECTORY = Uri.joinPath(
  FIXTURES_DIRECTORY,
  'runtime_error',
);
const packageDocumentUri = Uri.joinPath(
  RUNTIME_ERROR_DIRECTORY,
  'package.proto',
);

describe('runtime-error:', function () {
  let packageDocument: TextDocument;

  before('Initialize API-s and parameters', async function () {
    this.timeout(debugTimeout(10_000));

    await closeDocuments();
    await resetCommandConfig();

    await resetWorkspaceFolders();
    await appendWorkspaceFolders([RUNTIME_ERROR_DIRECTORY]);

    const diagnostics = getTargetDiagnostics(packageDocumentUri, [
      RUNTIME_ERROR_CODE,
    ]);

    packageDocument = await workspace.openTextDocument(packageDocumentUri);

    await window.showTextDocument(packageDocument, {
      preserveFocus: false,
      preview: false,
    });

    await diagnostics;
  });

  after('runtime-error tests teardown', async function () {
    await closeDocuments();
    await resetWorkspaceFolders();
  });

  it(`should have correct diagnostics`, function () {
    expect(getDiagnosticCodes(packageDocument.uri)).to.deep.equal([
      RUNTIME_ERROR_CODE,
    ]);
  });
});
