import { expect } from 'chai';
import { commands, Uri, window, workspace } from 'vscode';

import {
  EDITOR_COMMAND_AUTOFIX,
  SUPPORTED_LANGUAGE_ID,
} from '../../dist/constants.js';
import {
  appendWorkspaceFolders,
  closeDocuments,
  debugTimeout,
  FIXTURES_DIRECTORY,
  getTargetDiagnostics,
  resetCommandConfig,
  resetWorkspaceFolders,
  setDocumentText,
} from '../helpers.js';

import type { TextDocument } from 'vscode';

const FIXER_DIRECTORY = Uri.joinPath(FIXTURES_DIRECTORY, 'fixer');
const HYPHENATED_FIXTURE_BASENAME = 'fixable-file.proto';
const EDITABLE_FIXTURE_BASENAME = 'to_edit.proto';

const hyphenatedDocumentUri = Uri.joinPath(
  FIXER_DIRECTORY,
  HYPHENATED_FIXTURE_BASENAME,
);
const editedDocumentUri = Uri.joinPath(
  FIXER_DIRECTORY,
  EDITABLE_FIXTURE_BASENAME,
);

const hyphenatedDocumentCodes = [
  'FILE_NAMES_LOWER_SNAKE_CASE',
  'MESSAGE_NAMES_UPPER_CAMEL_CASE',
];
const documentCodes = ['MESSAGE_NAMES_UPPER_CAMEL_CASE'];
const untitledDocumentCodes = [
  'FIELD_NAMES_LOWER_SNAKE_CASE',
  'MESSAGE_NAMES_UPPER_CAMEL_CASE',
];

const UNCHANGEABLE_LINE = 3;

describe('fixer:', function () {
  before('Initialize API-s and parameters', async function () {
    this.timeout(debugTimeout(10_000));

    await closeDocuments();
    await resetCommandConfig();

    await resetWorkspaceFolders();
    await appendWorkspaceFolders([FIXER_DIRECTORY]);
  });

  after('fixer tests teardown', async function () {
    await closeDocuments();
    await resetWorkspaceFolders();
  });

  describe('#Fixer', function () {
    let hyphenatedDocument: TextDocument;
    let hyphenatedDocumentText: string;
    let untitledDocument: TextDocument;
    let editedDocument: TextDocument;

    before(`Fixer tests setup`, async function () {
      let diagnostics = getTargetDiagnostics(
        hyphenatedDocumentUri,
        hyphenatedDocumentCodes,
      );

      hyphenatedDocument = await workspace.openTextDocument(
        hyphenatedDocumentUri,
      );

      await window.showTextDocument(hyphenatedDocument, {
        preserveFocus: false,
        preview: false,
      });
      hyphenatedDocumentText = hyphenatedDocument.getText();
      await diagnostics;

      untitledDocument = await workspace.openTextDocument({
        content: hyphenatedDocument.getText(),
        language: SUPPORTED_LANGUAGE_ID,
      });
      diagnostics = getTargetDiagnostics(
        untitledDocument.uri,
        untitledDocumentCodes,
      );

      await window.showTextDocument(untitledDocument, {
        preserveFocus: false,
        preview: false,
      });

      await diagnostics;

      editedDocument = await workspace.openTextDocument(editedDocumentUri);
      await window.showTextDocument(editedDocument, {
        preserveFocus: false,
        preview: false,
      });

      diagnostics = getTargetDiagnostics(editedDocument.uri, documentCodes);
      await setDocumentText(editedDocument.uri, hyphenatedDocumentText, false);
      await diagnostics;
      expect(
        editedDocument.isDirty,
        `The document '${editedDocument.uri.toString()}' must have unsaved changes`,
      ).to.be.true;
    });

    afterEach(`Fixer tests cleanup`, async function () {
      if (hyphenatedDocument.getText() !== hyphenatedDocumentText) {
        const diagnostics = getTargetDiagnostics(
          hyphenatedDocument.uri,
          hyphenatedDocumentCodes,
        );

        await setDocumentText(
          hyphenatedDocument.uri,
          hyphenatedDocumentText,
          true,
        );
        await diagnostics;
      }

      if (untitledDocument.getText() !== hyphenatedDocumentText) {
        const diagnostics = getTargetDiagnostics(
          untitledDocument.uri,
          untitledDocumentCodes,
        );

        await setDocumentText(
          untitledDocument.uri,
          hyphenatedDocumentText,
          false,
        );
        await diagnostics;
      }

      if (editedDocument.getText() !== hyphenatedDocumentText) {
        const diagnostics = getTargetDiagnostics(
          editedDocument.uri,
          documentCodes,
        );

        await setDocumentText(
          editedDocument.uri,
          hyphenatedDocumentText,
          false,
        );
        await diagnostics;
      }
    });

    it(`should fix errors in the document with a name in kebab-case`, async function () {
      await window.showTextDocument(hyphenatedDocument, {
        preserveFocus: false,
        preview: false,
      });

      const { text } = hyphenatedDocument.lineAt(UNCHANGEABLE_LINE);
      const targetCodes = ['FILE_NAMES_LOWER_SNAKE_CASE'];
      const diagnostics = getTargetDiagnostics(
        hyphenatedDocument.uri,
        targetCodes,
      );

      await commands.executeCommand(EDITOR_COMMAND_AUTOFIX, 'none');
      expect(
        await diagnostics,
        `All errors except filename must be fixed`,
      ).to.deep.equal(targetCodes);
      expect(
        hyphenatedDocument.lineAt(UNCHANGEABLE_LINE).text,
        `The rule removed via the config must not be autofixed`,
      ).to.equal(text);
    });

    it(`should fix errors in the untitled document`, async function () {
      await window.showTextDocument(untitledDocument, {
        preserveFocus: false,
        preview: false,
      });

      const targetCodes: string[] = [];
      const diagnostics = getTargetDiagnostics(
        untitledDocument.uri,
        targetCodes,
      );

      await commands.executeCommand(EDITOR_COMMAND_AUTOFIX, 'none');

      expect(await diagnostics, `All errors must be fixed`).to.deep.equal(
        targetCodes,
      );
    });

    it(`should fix errors in the edited document text`, async function () {
      await window.showTextDocument(editedDocument, {
        preserveFocus: false,
        preview: false,
      });

      const { text } = editedDocument.lineAt(UNCHANGEABLE_LINE);
      const targetCodes: string[] = [];
      const diagnostics = getTargetDiagnostics(editedDocument.uri, targetCodes);

      await commands.executeCommand(EDITOR_COMMAND_AUTOFIX, 'none');

      expect(await diagnostics, `All errors must be fixed`).to.deep.equal(
        targetCodes,
      );
      expect(
        editedDocument.lineAt(UNCHANGEABLE_LINE).text,
        `The rule removed via the config must not be autofixed`,
      ).to.equal(text);
    });
  });
});
