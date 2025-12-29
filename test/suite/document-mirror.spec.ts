import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect } from 'chai';
import { Uri, workspace, WorkspaceEdit } from 'vscode';

import { SUPPORTED_LANGUAGE_ID } from '../../dist/constants.js';
import {
  appendWorkspaceFolders,
  closeDocuments,
  debugTimeout,
  FIXTURES_DIRECTORY,
  getReflection,
  getWorkspaceFolder,
  removeWorkspaceFolder,
  resetCommandConfig,
  resetWorkspaceFolders,
  setDocumentText,
} from '../helpers.js';

import type { TextDocument, WorkspaceFolder } from 'vscode';

const FOLDER_FIXTURE = Uri.joinPath(FIXTURES_DIRECTORY, 'folder');
const MIRROR_FIXTURE_BASENAME = 'mirror.proto';
const OUTER_FOLDER_FIXTURE = Uri.joinPath(FIXTURES_DIRECTORY, 'mirror_outer');
const INNER_FOLDER_FIXTURE = Uri.joinPath(OUTER_FOLDER_FIXTURE, 'mirror_inner');

async function safeEdit(document: TextDocument) {
  const edit = new WorkspaceEdit();

  edit.insert(document.uri, document.positionAt(0), ' ');
  await workspace.applyEdit(edit);
}

describe('document-mirror:', function () {
  before('Initialize API-s and parameters', async function () {
    this.timeout(debugTimeout(10_000));

    await closeDocuments();
    await resetCommandConfig();

    await resetWorkspaceFolders();
    await appendWorkspaceFolders([OUTER_FOLDER_FIXTURE, INNER_FOLDER_FIXTURE]);
  });

  after('document-mirror tests teardown', async function () {
    await closeDocuments();
    await resetWorkspaceFolders();
  });

  describe(`#DocumentMirror`, function () {
    describe(`#reflect()`, function () {
      let tmpdirUri: Uri;
      let outerFolder: WorkspaceFolder;
      let innerFolder: WorkspaceFolder;

      let folderDocument: TextDocument;
      let outerDocument: TextDocument;
      let innerDocument: TextDocument;
      let noFolderDocument: TextDocument;
      let untitledDocument: TextDocument;

      let initialNoFolderText: string;
      let initialUntitledText: string;

      before(`#reflect() tests setup`, async function () {
        tmpdirUri = Uri.file(tmpdir());

        outerFolder = getWorkspaceFolder(OUTER_FOLDER_FIXTURE);
        innerFolder = getWorkspaceFolder(INNER_FOLDER_FIXTURE);

        folderDocument = await workspace.openTextDocument(
          Uri.joinPath(FOLDER_FIXTURE, MIRROR_FIXTURE_BASENAME),
        );
        await safeEdit(folderDocument);

        outerDocument = await workspace.openTextDocument(
          Uri.joinPath(OUTER_FOLDER_FIXTURE, MIRROR_FIXTURE_BASENAME),
        );
        await safeEdit(outerDocument);

        innerDocument = await workspace.openTextDocument(
          Uri.joinPath(INNER_FOLDER_FIXTURE, MIRROR_FIXTURE_BASENAME),
        );
        await safeEdit(innerDocument);

        noFolderDocument = await workspace.openTextDocument(
          Uri.joinPath(FIXTURES_DIRECTORY, MIRROR_FIXTURE_BASENAME),
        );
        await safeEdit(noFolderDocument);
        initialNoFolderText = noFolderDocument.getText();

        initialUntitledText = `syntax = "proto3";`;
        untitledDocument = await workspace.openTextDocument({
          content: initialUntitledText,
          language: SUPPORTED_LANGUAGE_ID,
        });
      });

      afterEach(`#reflect() tests cleanup`, async function () {
        if (workspace.getWorkspaceFolder(OUTER_FOLDER_FIXTURE) === undefined) {
          await appendWorkspaceFolders([OUTER_FOLDER_FIXTURE]);

          outerFolder = getWorkspaceFolder(OUTER_FOLDER_FIXTURE);
        }

        if (workspace.getWorkspaceFolder(INNER_FOLDER_FIXTURE) === undefined) {
          await appendWorkspaceFolders([INNER_FOLDER_FIXTURE]);

          innerFolder = getWorkspaceFolder(INNER_FOLDER_FIXTURE);
        }

        if (noFolderDocument.getText() !== initialNoFolderText) {
          await setDocumentText(
            noFolderDocument.uri,
            initialNoFolderText,
            false,
          );
        }
        if (untitledDocument.getText() !== initialUntitledText) {
          await setDocumentText(
            untitledDocument.uri,
            initialUntitledText,
            false,
          );
        }
      });

      it(`should return the up-to-date document text`, async function () {
        let { fileUri } = await getReflection(folderDocument);
        let actualText = await readFile(fileUri.fsPath, { encoding: 'utf8' });

        expect(
          actualText,
          `The reflected text must be equal to the current Workspace Folder document state`,
        ).to.equal(folderDocument.getText());

        ({ fileUri } = await getReflection(noFolderDocument));
        actualText = await readFile(fileUri.fsPath, { encoding: 'utf8' });

        expect(
          actualText,
          `The reflected text must be equal to the current no-Workspace-Folder document state`,
        ).to.equal(noFolderDocument.getText());

        ({ fileUri } = await getReflection(untitledDocument));
        actualText = await readFile(fileUri.fsPath, { encoding: 'utf8' });

        expect(
          actualText,
          `The reflected text must be equal to the current untitled document state`,
        ).to.equal(untitledDocument.getText());
      });

      it(`should return the temporary file when the document is dirty`, async function () {
        await using reflection = await getReflection(folderDocument);

        expect(folderDocument.isDirty, `The document must be dirty`).to.be.true;
        expect(
          reflection.fileUri.toString().startsWith(tmpdirUri.toString()),
          `The reflection file must be within the OS temporary directory`,
        ).to.be.true;
      });

      it(`should use the same directory for nested Workspace Folders`, async function () {
        await using outerReflection = await getReflection(outerDocument);
        await using innerReflection = await getReflection(innerDocument);

        expect(
          innerReflection.fileUri
            .toString()
            .startsWith(Uri.file(outerReflection.cwd).toString()),
          `The nested Workspace Folder document must use the temporary directory of its parent Workspace Folder`,
        ).to.be.true;

        await using reflection = await getReflection(folderDocument);

        expect(
          outerReflection.cwd.startsWith(reflection.cwd),
          `The unnested Workspace Folder must use a unique temporary directory`,
        ).to.be.false;
      });

      it(`should use a new temporary directory after closing the outermost Workspace Folder`, async function () {
        await using initialOuterReflection = await getReflection(outerDocument);

        await removeWorkspaceFolder(outerFolder.uri);

        await using outerReflection = await getReflection(outerDocument);

        expect(
          outerReflection.cwd,
          `A new temporary directory must be allocated after closing the folder '${outerFolder.uri.fsPath}'`,
        ).to.not.equal(initialOuterReflection.cwd);
      });

      it(`shouldn't use a new temporary directory after closing the nested Workspace Folder`, async function () {
        await using initialInnerReflection = await getReflection(innerDocument);

        const relative = path.relative(
          innerFolder.uri.fsPath,
          outerFolder.uri.fsPath,
        );

        expect(
          relative,
          `Inner and outer folder paths mustn't equal`,
        ).to.not.equal('');

        await removeWorkspaceFolder(innerFolder.uri);

        await using innerReflection = await getReflection(innerDocument);

        expect(
          innerReflection.cwd,
          `The reflection cwd must be correct after closing the nested Workspace Folder`,
        ).to.equal(path.join(initialInnerReflection.cwd, relative));

        await appendWorkspaceFolders([INNER_FOLDER_FIXTURE]);
        await using restoredInnerReflection =
          await getReflection(innerDocument);

        expect(
          restoredInnerReflection.cwd,
          `The reflection cwd must be correct after restoring the closed Workspace Folder`,
        ).to.equal(initialInnerReflection.cwd);
      });

      it(`shouldn't use Workspace Folder temporary directories for no-Workspace-Folder and untitled documents`, async function () {
        await using documentReflection = await getReflection(folderDocument);
        await using outerReflection = await getReflection(outerDocument);
        await using innerReflection = await getReflection(innerDocument);
        await using noFolderReflection = await getReflection(noFolderDocument);
        await using untitledReflection = await getReflection(untitledDocument);

        expect([
          documentReflection.cwd,
          innerReflection.cwd,
          outerReflection.cwd,
        ])
          .to.not.include(untitledReflection.cwd)
          .and.not.include(noFolderReflection.cwd);
      });

      it(`should persist temporary directories for no-Workspace-Folder and untitled documents`, async function () {
        const initialNoFolder = await getReflection(noFolderDocument);
        const initialUntitled = await getReflection(untitledDocument);

        await safeEdit(noFolderDocument);
        await safeEdit(untitledDocument);

        await initialNoFolder[Symbol.asyncDispose]();
        await initialUntitled[Symbol.asyncDispose]();

        await using noFolder = await getReflection(noFolderDocument);
        await using untitled = await getReflection(untitledDocument);

        expect(noFolder.cwd).to.equal(initialNoFolder.cwd);
        expect(untitled.cwd).to.equal(initialUntitled.cwd);
      });
    });
  });
});
