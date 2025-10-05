import path from 'node:path';

import { expect } from 'chai';
import { ConfigurationTarget, Uri, workspace } from 'vscode';

import {
  CONFIG_COMMAND_KEY,
  CONFIG_COMMAND_SECTION,
} from '../../dist/config.js';
import { CONFIG_SECTION } from '../../dist/constants.js';
import { ExecuteErrorCode } from '../../dist/executable.js';
import {
  appendWorkspaceFolders,
  closeDocuments,
  configurationAffectedAssertion,
  debugTimeout,
  FIXTURES_DIRECTORY,
  getExecutablePath,
  getFolderExecutable,
  getSetCommandEvent,
  getTestingApi,
  getWorkspaceExecutable,
  getWorkspaceFolder,
  getWorkspaceFolders,
  INVALID_EXECUTABLE_COMMAND,
  promisifyEvent,
  removeWorkspaceFolder,
  resetCommandConfig,
  resetWorkspaceFolders,
  statusChangeAvailableAssertion,
  statusChangeUnavailableAssertion,
} from '../helpers.js';

import type { TextDocument, WorkspaceFolder } from 'vscode';

import type { ITesting } from '../../dist/extension.js';

const OUTER_FOLDER_FIXTURE = Uri.joinPath(FIXTURES_DIRECTORY, 'config_outer');
const INNER_FOLDER_FIXTURE = Uri.joinPath(OUTER_FOLDER_FIXTURE, 'config_inner');
const CONFIG_BASENAME = 'config.proto';

describe('config:', function () {
  let pathCache: ITesting['executableCache'];
  let executablePath: string;

  before('Initialize API-s and parameters', async function () {
    this.timeout(debugTimeout(5000));

    ({ executableCache: pathCache } = await getTestingApi());
    await closeDocuments();
    executablePath = getExecutablePath();

    await resetWorkspaceFolders();
  });

  after('Reset path config and workspace folders', async function () {
    await closeDocuments();
    await resetCommandConfig();
    await resetWorkspaceFolders();
  });

  describe('#PathCache', function () {
    // #region Executable tests
    describe('executables', function () {
      beforeEach('executable test setup', async function () {
        await resetCommandConfig();
      });

      afterEach('executable test cleanup', async function () {
        await resetCommandConfig();
      });

      it('global executable should be the only available executable by default', function () {
        expect(
          pathCache.global.status.errorCode,
          'The cache global executable must be available',
        ).to.be.undefined;

        expect(
          pathCache.workspace,
          'The cache workspace executable must be undefined',
        ).to.be.undefined;

        expect(
          pathCache.workspaceFolders,
          'The cache folders map must be empty',
        ).to.be.empty;
      });

      // eslint-disable-next-line sonarjs/assertions-in-tests
      it(`global executable should become available with the correct path`, async function () {
        const { global } = pathCache;
        let changeStatus = promisifyEvent(
          global.onDidChangeStatus,
          statusChangeUnavailableAssertion,
        );

        await workspace
          .getConfiguration(CONFIG_SECTION)
          .update(
            CONFIG_COMMAND_KEY,
            INVALID_EXECUTABLE_COMMAND,
            ConfigurationTarget.Global,
          );
        await changeStatus;

        changeStatus = promisifyEvent(
          global.onDidChangeStatus,
          statusChangeAvailableAssertion,
        );

        await workspace
          .getConfiguration(CONFIG_SECTION)
          .update(
            CONFIG_COMMAND_KEY,
            executablePath,
            ConfigurationTarget.Global,
          );
        await changeStatus;
      });

      it('folder executable should become available with the correct path', async function () {
        for (const folder of getWorkspaceFolders()) {
          const executableCreated = promisifyEvent(
            pathCache.onDidCreateExecutable,
          );

          await workspace
            .getConfiguration(CONFIG_SECTION, folder)
            .update(
              CONFIG_COMMAND_KEY,
              INVALID_EXECUTABLE_COMMAND,
              ConfigurationTarget.WorkspaceFolder,
            );
          await executableCreated;

          expect(
            pathCache.workspaceFolders,
            `'${folder.name}' workspace folder must have the corresponding cache key`,
          ).to.have.keys([folder]);

          const executable = getFolderExecutable(pathCache, folder);

          expect(
            executable.status.errorCode,
            'The folder executable must be unavailable',
          ).to.equal(ExecuteErrorCode.Unavailable);

          const changeStatus = promisifyEvent(
            executable.onDidChangeStatus,
            statusChangeAvailableAssertion,
          );

          await workspace
            .getConfiguration(CONFIG_SECTION, folder)
            .update(
              CONFIG_COMMAND_KEY,
              executablePath,
              ConfigurationTarget.WorkspaceFolder,
            );
          await changeStatus;
        }
      });

      it('workspace executable should become available with the correct path', async function () {
        const executableCreated = promisifyEvent(
          pathCache.onDidCreateExecutable,
        );

        await workspace
          .getConfiguration(CONFIG_SECTION)
          .update(
            CONFIG_COMMAND_KEY,
            INVALID_EXECUTABLE_COMMAND,
            ConfigurationTarget.Workspace,
          );
        await executableCreated;

        const workspaceExecutable = getWorkspaceExecutable(pathCache);

        expect(
          workspaceExecutable.status.errorCode,
          'The workspace executable must be unavailable',
        ).to.equal(ExecuteErrorCode.Unavailable);

        const changeStatus = promisifyEvent(
          workspaceExecutable.onDidChangeStatus,
          statusChangeAvailableAssertion,
        );

        await workspace
          .getConfiguration(CONFIG_SECTION)
          .update(
            CONFIG_COMMAND_KEY,
            executablePath,
            ConfigurationTarget.Workspace,
          );
        await changeStatus;
      });
    });
    // #endregion

    // #region Relative path tests
    describe('the executable path setting', function () {
      const COMMAND = 'protolint';
      const ABSOLUTE_PATH = '/foo/bar';
      let folder: WorkspaceFolder;
      let relativePath: string;

      before('Executable path tests setup', function () {
        [folder] = getWorkspaceFolders();

        expect(
          folder,
          'There must be a workspace folder for testing relative executable path',
        ).not.to.be.undefined;

        relativePath = path
          .relative(folder.uri.fsPath, executablePath)
          .replaceAll(path.win32.sep, path.posix.sep);
      });

      beforeEach('Executable path test setup', async function () {
        await resetCommandConfig();
      });

      after('Executable path tests teardown', async function () {
        await resetCommandConfig();
      });

      describe(`with an absolute path`, function () {
        afterEach('Absolute path test cleanup', async function () {
          await resetCommandConfig();
        });

        it('should be used as is for the workspace folder configuration', async function () {
          const executableCreated = promisifyEvent(
            pathCache.onDidCreateExecutable,
          );

          await workspace
            .getConfiguration(CONFIG_SECTION, folder)
            .update(
              CONFIG_COMMAND_KEY,
              ABSOLUTE_PATH,
              ConfigurationTarget.WorkspaceFolder,
            );
          await executableCreated;

          expect(
            pathCache.workspaceFolders.get(folder)?.command,
            `The value '${ABSOLUTE_PATH}' should be used as is for the workspace folder configuration`,
          ).to.equal(ABSOLUTE_PATH);
        });

        it('should be used as is for the workspace configuration', async function () {
          const executableCreated = promisifyEvent(
            pathCache.onDidCreateExecutable,
          );

          await workspace
            .getConfiguration(CONFIG_SECTION)
            .update(
              CONFIG_COMMAND_KEY,
              ABSOLUTE_PATH,
              ConfigurationTarget.Workspace,
            );
          await executableCreated;

          expect(
            getWorkspaceExecutable(pathCache).command,
            `The value '${ABSOLUTE_PATH}' should be used as is for the workspace configuration`,
          ).to.equal(ABSOLUTE_PATH);
        });

        it('should be set as is for the global configuration', async function () {
          const globalConfigurationChange = promisifyEvent(
            workspace.onDidChangeConfiguration,
            configurationAffectedAssertion(CONFIG_COMMAND_SECTION),
          );
          const pathSet = promisifyEvent(getSetCommandEvent(pathCache.global));

          await workspace
            .getConfiguration(CONFIG_SECTION)
            .update(
              CONFIG_COMMAND_KEY,
              ABSOLUTE_PATH,
              ConfigurationTarget.Global,
            );
          await globalConfigurationChange;
          await pathSet;

          expect(
            pathCache.global.command,
            `The value '${ABSOLUTE_PATH}' should be set as is for the global configuration`,
          ).to.equal(ABSOLUTE_PATH);
        });
      });

      describe('with a relative path', function () {
        afterEach('Relative path test cleanup', async function () {
          await resetCommandConfig();
        });

        it('should be resolved for a workspace folder against its root', async function () {
          const executableCreated = promisifyEvent(
            pathCache.onDidCreateExecutable,
          );

          await workspace
            .getConfiguration(CONFIG_SECTION, folder)
            .update(
              CONFIG_COMMAND_KEY,
              relativePath,
              ConfigurationTarget.WorkspaceFolder,
            );
          await executableCreated;

          expect(
            getFolderExecutable(pathCache, folder).command,
            `The relative path must be correctly resolved against the workspace folder root: ${folder.uri.toString()}`,
          ).to.equal(executablePath);
        });

        it(`should be set as is for the workspace configuration`, async function () {
          const executableCreated = promisifyEvent(
            pathCache.onDidCreateExecutable,
          );

          await workspace
            .getConfiguration(CONFIG_SECTION)
            .update(
              CONFIG_COMMAND_KEY,
              relativePath,
              ConfigurationTarget.Workspace,
            );
          await executableCreated;

          expect(
            getWorkspaceExecutable(pathCache).command,
            `The value '${relativePath}' shouldn't be resolved as a relative path for the workspace configuration`,
          ).to.equal(relativePath);
        });

        it(`should be set as is for the global configuration`, async function () {
          const pathSet = promisifyEvent(getSetCommandEvent(pathCache.global));

          await workspace
            .getConfiguration(CONFIG_SECTION)
            .update(
              CONFIG_COMMAND_KEY,
              relativePath,
              ConfigurationTarget.Global,
            );
          await pathSet;

          expect(
            pathCache.global.command,
            `The value '${relativePath}' shouldn't be resolved as a relative path for the global configuration`,
          ).to.equal(relativePath);
        });
      });

      describe(`with a command-looking value`, function () {
        afterEach('Command test cleanup', async function () {
          await resetCommandConfig();
        });

        it(`should be set as is for the workspace folder configuration`, async function () {
          const executableCreated = promisifyEvent(
            pathCache.onDidCreateExecutable,
          );

          await workspace
            .getConfiguration(CONFIG_SECTION, folder)
            .update(
              CONFIG_COMMAND_KEY,
              COMMAND,
              ConfigurationTarget.WorkspaceFolder,
            );
          await executableCreated;

          expect(
            getFolderExecutable(pathCache, folder).command,
            `The value '${COMMAND}' should be set as is for a workspace folder executable`,
          ).to.equal(COMMAND);
        });

        it(`should be set as is for the workspace configuration`, async function () {
          const executableCreated = promisifyEvent(
            pathCache.onDidCreateExecutable,
          );

          await workspace
            .getConfiguration(CONFIG_SECTION)
            .update(CONFIG_COMMAND_KEY, COMMAND, ConfigurationTarget.Workspace);
          await executableCreated;

          expect(
            getWorkspaceExecutable(pathCache).command,
            `The value '${COMMAND}' should be set as is for the workspace executable`,
          ).to.equal(COMMAND);
        });

        it(`should be set as is for the global configuration`, async function () {
          const pathSet = promisifyEvent(getSetCommandEvent(pathCache.global));

          await workspace
            .getConfiguration(CONFIG_SECTION)
            .update(CONFIG_COMMAND_KEY, COMMAND, ConfigurationTarget.Global);
          await pathSet;

          expect(
            pathCache.global.command,
            `The value '${COMMAND}' should be set as is for the global executable`,
          ).to.equal(COMMAND);
        });
      });
    });
    // #endregion

    // #region getExecutable() tests
    describe('#getExecutable()', function () {
      let noFolderDocument: TextDocument;
      let innerFolderDocument: TextDocument;
      const folderDocuments: Map<Uri, TextDocument> = new Map<
        Uri,
        TextDocument
      >();

      const folderUrisToAppend = [OUTER_FOLDER_FIXTURE, INNER_FOLDER_FIXTURE];

      before('#getExecutable() tests setup', async function () {
        noFolderDocument = await workspace.openTextDocument(
          Uri.joinPath(FIXTURES_DIRECTORY, CONFIG_BASENAME),
        );

        folderDocuments.set(
          OUTER_FOLDER_FIXTURE,
          await workspace.openTextDocument(
            Uri.joinPath(OUTER_FOLDER_FIXTURE, CONFIG_BASENAME),
          ),
        );

        innerFolderDocument = await workspace.openTextDocument(
          Uri.joinPath(INNER_FOLDER_FIXTURE, CONFIG_BASENAME),
        );
        folderDocuments.set(INNER_FOLDER_FIXTURE, innerFolderDocument);
      });

      beforeEach('#getExecutable() tests setup', async function () {
        await resetCommandConfig();
        await resetWorkspaceFolders();

        await appendWorkspaceFolders(folderUrisToAppend);

        for (const folderUri of folderUrisToAppend) {
          const folder = getWorkspaceFolder(folderUri);
          const executableCreated = promisifyEvent(
            pathCache.onDidCreateExecutable,
          );

          await workspace
            .getConfiguration(CONFIG_SECTION, folder)
            .update(
              CONFIG_COMMAND_KEY,
              INVALID_EXECUTABLE_COMMAND,
              ConfigurationTarget.WorkspaceFolder,
            );
          await executableCreated;
        }
      });

      after('#getExecutable() tests teardown', async function () {
        await closeDocuments();
        await resetCommandConfig();
        await resetWorkspaceFolders();
      });

      it('should return the global executable', function () {
        expect(
          workspace.getWorkspaceFolder(noFolderDocument.uri),
          `The document ${noFolderDocument.uri.toString()} must have no Workspace Folder`,
        ).to.be.undefined;

        expect(
          pathCache.workspace,
          'The cache workspace executable must be undefined',
        ).to.be.undefined;

        expect(pathCache.getExecutable(noFolderDocument.uri)).to.equal(
          pathCache.global,
          `The document ${noFolderDocument.uri.toString()} must use the global executable`,
        );
      });

      it('should return the workspace executable', async function () {
        const executableCreated = promisifyEvent(
          pathCache.onDidCreateExecutable,
        );

        await workspace
          .getConfiguration(CONFIG_SECTION)
          .update(
            CONFIG_COMMAND_KEY,
            INVALID_EXECUTABLE_COMMAND,
            ConfigurationTarget.Workspace,
          );
        await executableCreated;

        expect(pathCache.getExecutable(noFolderDocument.uri)).to.equal(
          pathCache.workspace,
          `The document ${noFolderDocument.uri.toString()} must use the workspace executable`,
        );

        const executableRemoved = promisifyEvent(
          pathCache.onDidRemoveExecutable,
        );

        await workspace
          .getConfiguration(CONFIG_SECTION)
          .update(CONFIG_COMMAND_KEY, undefined, ConfigurationTarget.Workspace);
        await executableRemoved;
        expect(pathCache.workspace).to.be.undefined;
      });

      it('should return the correct folder executables', function () {
        for (const [folderUri, { uri }] of folderDocuments) {
          const folder = getWorkspaceFolder(folderUri);

          expect(
            pathCache.getExecutable(uri),
            `The correct executable must be returned for ${uri.toString()}`,
          ).to.equal(pathCache.workspaceFolders.get(folder));
        }
      });

      it('should return the correct executable after re-opening the closed workspace folder', async function () {
        let innerWorkspaceFolder = getWorkspaceFolder(INNER_FOLDER_FIXTURE);
        const executableRemoved = promisifyEvent(
          pathCache.onDidRemoveExecutable,
        );

        await removeWorkspaceFolder(innerWorkspaceFolder.uri);
        await executableRemoved;

        expect(
          pathCache.workspaceFolders.has(innerWorkspaceFolder),
          `The cache mustn't have Workspace Folder '${innerWorkspaceFolder.uri.toString()}'`,
        ).to.be.false;

        const outerWorkspaceFolder = getWorkspaceFolder(OUTER_FOLDER_FIXTURE);

        expect(
          pathCache.getExecutable(innerFolderDocument.uri),
          `outer_folder executable must be returned for the document ${innerFolderDocument.uri.toString()}`,
        ).to.equal(pathCache.workspaceFolders.get(outerWorkspaceFolder));

        const executableCreated = promisifyEvent(
          pathCache.onDidCreateExecutable,
        );

        await appendWorkspaceFolders([INNER_FOLDER_FIXTURE]);
        await executableCreated;

        innerWorkspaceFolder = getWorkspaceFolder(INNER_FOLDER_FIXTURE);

        expect(
          pathCache.workspaceFolders.has(innerWorkspaceFolder),
          `The cache must have Workspace Folder '${innerWorkspaceFolder.uri.toString()}'`,
        ).to.be.true;

        expect(
          pathCache.getExecutable(innerFolderDocument.uri),
          `inner_folder executable must be returned for the document ${innerFolderDocument.uri.toString()}`,
        ).to.equal(pathCache.workspaceFolders.get(innerWorkspaceFolder));
      });
    });
    // #endregion
  });
});
