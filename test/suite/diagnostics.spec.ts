import { expect } from 'chai';
import { languages, Uri, window, workspace, WorkspaceEdit } from 'vscode';

import {
  CONFIG_BASENAME,
  SUPPORTED_LANGUAGE_ID,
} from '../../dist/constants.js';
import {
  appendWorkspaceFolders,
  closeDocuments,
  debugTimeout,
  FIXTURES_DIRECTORY,
  getDiagnosticCodes,
  getTargetDiagnostics,
  removeWorkspaceFolder,
  resetCommandConfig,
  resetWorkspaceFolders,
  setDocumentText,
} from '../helpers.js';

import type { TextDocument } from 'vscode';

const DIAGNOSTICS_DIRECTORY = Uri.joinPath(FIXTURES_DIRECTORY, 'diagnostics');
const EXCLUDED_DIRECTORY = Uri.joinPath(DIAGNOSTICS_DIRECTORY, 'excluded');
const NESTED_DIAGNOSTICS_FIXTURE = Uri.joinPath(
  DIAGNOSTICS_DIRECTORY,
  'nested',
);
const DIAGNOSTICS_FIXTURE_BASENAME = 'diagnostics.proto';

const rootDocumentUri = Uri.joinPath(
  DIAGNOSTICS_DIRECTORY,
  DIAGNOSTICS_FIXTURE_BASENAME,
);
const documentTargetUri = Uri.joinPath(
  rootDocumentUri,
  '..',
  `new_${DIAGNOSTICS_FIXTURE_BASENAME}`,
);
const rootConfigUri = Uri.joinPath(DIAGNOSTICS_DIRECTORY, CONFIG_BASENAME);
const rootConfigTargetUri = Uri.joinPath(rootConfigUri, '..', 'temp.yaml');

const documentCodes = ['MESSAGE_NAMES_UPPER_CAMEL_CASE'];
const untitledCodes = [
  'FIELD_NAMES_LOWER_SNAKE_CASE',
  'MESSAGE_NAMES_UPPER_CAMEL_CASE',
];
const excludedCodes: string[] = [];

async function renameFile(source: Uri, target: Uri): Promise<TextDocument> {
  const edit = new WorkspaceEdit();

  edit.renameFile(source, target, { overwrite: false });
  await workspace.applyEdit(edit);

  return workspace.openTextDocument(target);
}

async function undoRenameFile(
  current: Uri,
  initial: Uri,
): Promise<TextDocument> {
  try {
    await workspace.fs.stat(initial);

    return await workspace.openTextDocument(initial);
  } catch {
    // Continue, the initial file doesn't exist
  }

  try {
    await workspace.fs.stat(current);

    return await renameFile(current, initial);
  } catch {
    // Continue, the file wasn't renamed
  }

  return workspace.openTextDocument(initial);
}

describe('diagnostics:', function () {
  before('Initialize API-s and parameters', async function () {
    this.timeout(debugTimeout(10_000));

    await closeDocuments();
    await resetCommandConfig();

    await resetWorkspaceFolders();
    await appendWorkspaceFolders([DIAGNOSTICS_DIRECTORY]);
  });

  after('diagnostics tests teardown', async function () {
    await closeDocuments();
    await resetWorkspaceFolders();
  });

  describe('#Diagnostics', function () {
    let initialRootConfig: string;
    let initialRootDocumentText: string;
    let rootDocument: TextDocument;
    let nestedDocument: TextDocument;
    let untitledDocument: TextDocument;
    let excludedDocument: TextDocument;

    before(`Diagnostics tests setup`, async function () {
      const rootConfig = await workspace.openTextDocument(rootConfigUri);

      initialRootConfig = rootConfig.getText();

      rootDocument = await workspace.openTextDocument(rootDocumentUri);
      initialRootDocumentText = rootDocument.getText();
      const rootDiagnostics = getTargetDiagnostics(
        rootDocument.uri,
        documentCodes,
      );

      await window.showTextDocument(rootDocument, {
        preserveFocus: false,
        preview: false,
      });
      await rootDiagnostics;

      nestedDocument = await workspace.openTextDocument(
        Uri.joinPath(NESTED_DIAGNOSTICS_FIXTURE, DIAGNOSTICS_FIXTURE_BASENAME),
      );
      const nestedDiagnostics = getTargetDiagnostics(
        nestedDocument.uri,
        documentCodes,
      );

      await window.showTextDocument(nestedDocument, {
        preserveFocus: false,
        preview: false,
      });
      await nestedDiagnostics;

      untitledDocument = await workspace.openTextDocument({
        content: rootDocument.getText(),
        language: SUPPORTED_LANGUAGE_ID,
      });
      const untitledDiagnostics = getTargetDiagnostics(
        untitledDocument.uri,
        untitledCodes,
      );

      await window.showTextDocument(untitledDocument, {
        preserveFocus: false,
        preview: false,
      });
      await untitledDiagnostics;

      excludedDocument = await workspace.openTextDocument(
        Uri.joinPath(EXCLUDED_DIRECTORY, DIAGNOSTICS_FIXTURE_BASENAME),
      );
      const excludedDiagnostics = getTargetDiagnostics(
        excludedDocument.uri,
        excludedCodes,
      );

      await window.showTextDocument(excludedDocument, {
        preserveFocus: false,
        preview: false,
      });
      await excludedDiagnostics;
    });

    afterEach(`diagnostics test cleanup`, async function () {
      if (untitledDocument.languageId !== SUPPORTED_LANGUAGE_ID) {
        untitledDocument = await languages.setTextDocumentLanguage(
          untitledDocument,
          SUPPORTED_LANGUAGE_ID,
        );

        await getTargetDiagnostics(untitledDocument.uri, untitledCodes);
      }

      try {
        await workspace.fs.stat(rootConfigUri);
      } catch {
        const rootDiagnostics = getTargetDiagnostics(
          rootDocument.uri,
          documentCodes,
        );
        const nestedDiagnostics = getTargetDiagnostics(
          nestedDocument.uri,
          documentCodes,
        );

        await undoRenameFile(rootConfigTargetUri, rootConfigUri);
        await rootDiagnostics;
        await nestedDiagnostics;
      }

      const rootConfig = await workspace.openTextDocument(rootConfigUri);

      if (rootConfig.getText() !== initialRootConfig) {
        const rootDiagnostics = getTargetDiagnostics(
          rootDocument.uri,
          documentCodes,
        );
        const nestedDiagnostics = getTargetDiagnostics(
          nestedDocument.uri,
          documentCodes,
        );

        await setDocumentText(rootConfigUri, initialRootConfig, true);

        await rootDiagnostics;
        await nestedDiagnostics;
      }

      rootDocument = await undoRenameFile(documentTargetUri, rootDocumentUri);

      if (
        !workspace.workspaceFolders?.find(
          ({ uri }) => uri.toString() === DIAGNOSTICS_DIRECTORY.toString(),
        )
      ) {
        const nestedDiagnostics = getTargetDiagnostics(
          nestedDocument.uri,
          documentCodes,
        );
        const rootDiagnostics = getTargetDiagnostics(
          rootDocument.uri,
          documentCodes,
        );

        await appendWorkspaceFolders([DIAGNOSTICS_DIRECTORY]);

        await nestedDiagnostics;
        await rootDiagnostics;
      }

      if (rootDocument.getText() !== initialRootDocumentText) {
        const rootDiagnostics = getTargetDiagnostics(
          rootDocument.uri,
          documentCodes,
        );

        await setDocumentText(rootDocument.uri, initialRootDocumentText, true);
        await workspace.save(rootDocument.uri);
        await rootDiagnostics;
      }
    });

    it(`should produce diagnostics`, function () {
      expect(
        getDiagnosticCodes(rootDocument.uri),
        `The document '${rootDocument.uri.toString()}' must have one diagnostic`,
      ).to.deep.equal(documentCodes);

      expect(
        getDiagnosticCodes(nestedDocument.uri),
        `The document '${nestedDocument.uri.toString()}' must have one diagnostic`,
      ).to.deep.equal(documentCodes);

      expect(
        getDiagnosticCodes(untitledDocument.uri),
        `The untitled document must have two diagnostics`,
      ).to.deep.equal(untitledCodes);
    });

    it(`should ignore the directory excluded via the config`, function () {
      expect(
        getDiagnosticCodes(excludedDocument.uri),
        `The excluded document must have no diagnostics`,
      ).to.deep.equal([]);
    });

    it(`should follow the document language`, async function () {
      const closedDocument = untitledDocument;

      untitledDocument = await languages.setTextDocumentLanguage(
        untitledDocument,
        'plaintext',
      );

      expect(
        getDiagnosticCodes(untitledDocument.uri),
        `There must be no diagnostics when the language is not '${SUPPORTED_LANGUAGE_ID}'`,
      ).to.deep.equal([]);
      expect(
        getDiagnosticCodes(closedDocument.uri),
        `The closed document must have no diagnostics`,
      ).to.deep.equal([]);

      untitledDocument = await languages.setTextDocumentLanguage(
        untitledDocument,
        SUPPORTED_LANGUAGE_ID,
      );

      expect(
        await getTargetDiagnostics(untitledDocument.uri, untitledCodes),
        `The untitled document must have two diagnostics`,
      ).to.deep.equal(untitledCodes);
    });

    it(`should respect the config file in the Workspace Folder root`, function () {
      const codes = getDiagnosticCodes(nestedDocument.uri);

      expect(
        codes,
        `The diagnostics must ignore any non-root-level configuration files`,
      ).to.include('MESSAGE_NAMES_UPPER_CAMEL_CASE');
      expect(
        codes,
        `The diagnostics must respect the root-level configuration file`,
      ).to.not.include('FIELD_NAMES_LOWER_SNAKE_CASE');
    });

    it(`should follow the config file deletion and creation`, async function () {
      const targetCodes: string[] = [
        'FIELD_NAMES_LOWER_SNAKE_CASE',
        ...documentCodes,
      ];
      const rootCodes = getTargetDiagnostics(rootDocument.uri, targetCodes);
      const nestedCodes = getTargetDiagnostics(nestedDocument.uri, targetCodes);

      await renameFile(rootConfigUri, rootConfigTargetUri);

      expect(
        await rootCodes,
        `The document '${rootDocument.uri.toString()}' must have the diagnostic previously removed via the config`,
      ).to.deep.equal(targetCodes);
      expect(
        await nestedCodes,
        `The document '${nestedDocument.uri.toString()}' must have the diagnostic previously removed via the config`,
      ).to.deep.equal(targetCodes);
    });

    it(`should follow the config file content changes`, async function () {
      const addedRule = 'MESSAGES_HAVE_COMMENT';
      const targetCodes: string[] = [...documentCodes, addedRule];

      expect(getDiagnosticCodes(nestedDocument.uri)).to.not.include(addedRule);

      const rootDiagnostics = getTargetDiagnostics(
        rootDocument.uri,
        targetCodes,
      );
      const nestedDiagnostics = getTargetDiagnostics(
        nestedDocument.uri,
        targetCodes,
      );

      const config = await workspace.openTextDocument(rootConfigUri);

      await window.showTextDocument(config, {
        preserveFocus: false,
        preview: false,
      });

      const edit = new WorkspaceEdit();

      edit.insert(
        config.uri,
        config.lineAt(config.lineCount - 1).range.end,
        `    add:\n      - ${addedRule}\n`,
      );

      await workspace.applyEdit(edit);
      await workspace.save(config.uri);

      let codes = await rootDiagnostics;

      expect(codes, `The diagnostics must respect the added rule`).to.include(
        addedRule,
      );
      expect(
        codes,
        `The diagnostics must respect the preexisting rule`,
      ).to.not.include('FIELD_NAMES_LOWER_SNAKE_CASE');

      codes = await nestedDiagnostics;

      expect(
        codes,
        `The diagnostics must ignore any non-root-level configuration files`,
      ).to.include('MESSAGE_NAMES_UPPER_CAMEL_CASE');
      expect(codes, `The diagnostics must respect the added rule`).to.include(
        addedRule,
      );
      expect(
        codes,
        `The diagnostics must respect the preexisting rule`,
      ).to.not.include('FIELD_NAMES_LOWER_SNAKE_CASE');
    });

    it(`should follow the document renaming`, async function () {
      const originalCodes = getDiagnosticCodes(rootDocumentUri);

      rootDocument = await renameFile(rootDocumentUri, documentTargetUri);

      expect(
        getDiagnosticCodes(rootDocumentUri),
        `There must be no diagnostics for the previous document path`,
      ).to.deep.equal([]);

      expect(
        await getTargetDiagnostics(rootDocument.uri, originalCodes),
        `The diagnostics must be related to the current document path`,
      ).to.deep.equal(originalCodes);
    });

    it(`should follow the Workspace folder closure`, async function () {
      const targetNestedCodes = ['FIELD_NAMES_LOWER_SNAKE_CASE'];
      const nestedDiagnostics = getTargetDiagnostics(
        nestedDocument.uri,
        targetNestedCodes,
      );

      const targetCodes = ['MESSAGE_NAMES_UPPER_CAMEL_CASE'];
      const excludedDiagnostics = getTargetDiagnostics(
        excludedDocument.uri,
        targetCodes,
      );

      const rootDiagnostics = getTargetDiagnostics(
        rootDocument.uri,
        targetCodes,
      );

      await removeWorkspaceFolder(DIAGNOSTICS_DIRECTORY);

      /**
       * protolint searches a current working directory for the config file and
       * successive parent directories all the way up to the root directory of
       * the filesystem.
       *
       * When a document has no Workspace Folder, the current working directory
       * is set to the document dirname.
       */
      expect(
        await nestedDiagnostics,
        `The document '${nestedDocument.uri.toString()}' must follow the nearest config`,
      ).to.deep.equal(targetNestedCodes);
      expect(
        await excludedDiagnostics,
        `The document '${excludedDocument.uri.toString()}' must obtain diagnostics`,
      ).to.deep.equal(targetCodes);
      expect(
        await rootDiagnostics,
        `The document '${rootDocument.uri.toString()}' must follow the nearest config`,
      ).to.deep.equal(targetCodes);
    });

    it(`should follow document text changes`, async function () {
      const targetCodes = [
        'ENUM_NAMES_UPPER_CAMEL_CASE',
        'MESSAGE_NAMES_UPPER_CAMEL_CASE',
      ];
      const edit = new WorkspaceEdit();

      edit.insert(
        rootDocument.uri,
        rootDocument.lineAt(rootDocument.lineCount - 1).range.end,
        `enum enum_name {\n}\n`,
      );

      const diagnostics = getTargetDiagnostics(rootDocument.uri, targetCodes);

      await workspace.applyEdit(edit);

      expect(
        await diagnostics,
        `The document '${rootDocument.uri.toString()}' must get the updated diagnostics`,
      ).to.deep.equal(targetCodes);
    });
  });
});
