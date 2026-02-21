import { url as inspectorUrl } from 'node:inspector';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { expect } from 'chai';
import {
  CodeAction,
  commands,
  ConfigurationTarget,
  extensions,
  languages,
  Uri,
  window,
  workspace,
  WorkspaceEdit,
} from 'vscode';

import { CONFIG_COMMAND_KEY } from '../dist/config.js';
import {
  COMMAND_LINT_DOCUMENTS,
  CONFIG_SECTION,
  DIAGNOSTIC_SOURCE,
  EDITOR_COMMAND_FIX_INDENTS,
  EXTENSION_ID,
} from '../dist/constants.js';
import { DocumentMirror } from '../dist/document-mirror.js';
import { executeCommand } from '../dist/helpers.js';
import { ProtolintDiagnostic, testing } from '../dist/rule-mapper.js';

import type { MochaOptions } from 'mocha';
import type {
  ConfigurationChangeEvent,
  Event,
  Range,
  TextDocument,
  WorkspaceFolder,
} from 'vscode';

import type { ExecutableCache } from '../dist/config.js';
import type { IReflection } from '../dist/document-mirror.js';
import type { Executable } from '../dist/executable.js';
import type { ITesting } from '../dist/extension.js';
import type { TExtractListener } from '../dist/helpers.js';
import type { TParsedMessage } from '../dist/rule-mapper.js';

type TMochaTimeout = Required<MochaOptions>['timeout'];

/**
 * The value for modifying Mocha's timeouts in debugging scenarios.
 */
const DEBUG_TIMEOUT: TMochaTimeout = 0;

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const FIXTURES_DIRECTORY = Uri.joinPath(Uri.file(PROJECT_ROOT), 'fixtures');
const RULES_FIXTURE_BASENAME = 'rule.mapper.proto';
const RULES_FIXTURE = Uri.joinPath(FIXTURES_DIRECTORY, RULES_FIXTURE_BASENAME);
const INVALID_EXECUTABLE_COMMAND = '_';

/**
 * Overrides Mocha timeouts for debugging purposes. If a particular timeout
 * shouldn't be changed when debugging, don't use this function for setting the
 * timeout.
 *
 * @param timeout The desired timeout for non-debugging scenarios.
 * @returns {@link DEBUG_TIMEOUT}, if Node.js inspector is attached.
 * Otherwise {@link timeout}.
 */
function debugTimeout(timeout: TMochaTimeout): TMochaTimeout {
  return inspectorUrl() === undefined ? timeout : DEBUG_TIMEOUT;
}

function getWorkspaceFolders(): readonly WorkspaceFolder[] {
  const { workspaceFolders } = workspace;

  if (workspaceFolders === undefined) {
    expect.fail('Workspace folders must not be undefined');
  }

  expect(
    workspaceFolders,
    'Workspace folders array must not be empty',
  ).to.be.an('array').that.is.not.empty;

  return workspaceFolders;
}

const INITIAL_WORKSPACE_FOLDERS = getWorkspaceFolders();

/**
 * A function with assertions to be run with {@link Event} fired.
 */
type TFiredEventAssertion<T extends Event<unknown>> =
  TExtractListener<T> extends (event: infer E) => unknown
    ? (event: E) => void
    : never;

async function appendWorkspaceFolders(
  folderUrisToAppend: readonly Uri[],
): Promise<void> {
  const workspaceFoldersChange = promisifyEvent(
    workspace.onDidChangeWorkspaceFolders,
    function ({ added, removed }) {
      expect(removed, 'Must be no workspace folders removed').to.be.an('array')
        .that.is.empty;

      expect(
        added.map(({ uri }) => uri),
        `Only the specified folders must be appended`,
      ).to.have.deep.members(folderUrisToAppend);
    },
  );

  expect(
    workspace.updateWorkspaceFolders(
      getWorkspaceFolders().length,
      undefined,
      ...folderUrisToAppend.map((uri) => ({ uri })),
    ),
    'Workspace folders update operation must be successful',
  ).to.be.true;
  await workspaceFoldersChange;
}

function getExecutablePath(): string {
  const moduleRoot = path.dirname(
    fileURLToPath(import.meta.resolve('protolint')),
  );

  return path.resolve(moduleRoot, `./bin/protolint`);
}

function getFolderExecutable(
  executableCache: ITesting['executableCache'],
  folder: WorkspaceFolder,
): Executable {
  const executable = executableCache.workspaceFolders.get(folder);

  if (executable === undefined) {
    expect.fail(
      `There must be an executable in the cache for the workspace folder ${folder.uri.fsPath}`,
    );
  }

  return executable;
}

function getSetCommandEvent(
  executable: Executable,
): NonNullable<Executable['_onDidSetCommand']> {
  if (executable._onDidSetCommand === undefined) {
    expect.fail(`Failed to get the event: '_onDidSetCommand'`);
  }

  return executable._onDidSetCommand;
}

async function getTestingApi(): Promise<ITesting> {
  const extension = extensions.getExtension<ITesting>(EXTENSION_ID);

  if (extension === undefined) {
    expect.fail(`Failed to get the extension: ${EXTENSION_ID}`);
  }

  if (extension.isActive) {
    return extension.exports;
  }

  return extension.activate();
}

function getWorkspaceExecutable(
  executableCache: ITesting['executableCache'],
): NonNullable<ExecutableCache['workspace']> {
  if (executableCache.workspace === undefined) {
    expect.fail('The workspace executable must exist in the cache');
  }

  return executableCache.workspace;
}

function getWorkspaceFolder(folderUri: Uri): WorkspaceFolder {
  const folder = workspace.getWorkspaceFolder(folderUri);

  if (folder === undefined) {
    expect.fail(`The workspace folder for '${folderUri.fsPath}' must exist`);
  }

  expect(
    folder.uri.fsPath,
    `The workspace folder's path must be '${folderUri.fsPath}'`,
  ).to.equal(folderUri.fsPath);

  return folder;
}

/**
 * Returns a promise that is resolved if the {@link event} is fired and if the
 * {@link assertion} succeeds.
 *
 * @param event An executable providing the `statusUpdate` events.
 * @param assertion A function with assertions to be run with the event fired.
 * If not set, the promise resolves if the event is fired.
 */
async function promisifyEvent<T>(
  event: Event<T>,
  assertion?: TFiredEventAssertion<typeof event>,
): Promise<void> {
  // https://github.com/typescript-eslint/typescript-eslint/issues/8113
  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  const { promise, reject, resolve } = Promise.withResolvers<void>();
  const disposable = event((value) => {
    try {
      assertion?.(value);
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Unknown error'));

      return;
    } finally {
      disposable.dispose();
    }

    resolve();
  });

  return promise;
}

async function removeWorkspaceFolder(folderUri: Uri): Promise<void> {
  const folder = getWorkspaceFolder(folderUri);

  expect(
    folder.index,
    `The folder to close must not be the initial one`,
  ).to.not.equal(0);

  const workspaceFoldersChange = promisifyEvent(
    workspace.onDidChangeWorkspaceFolders,
    function ({ added, removed }) {
      expect(added, 'Must be no workspace folders added').to.be.an('array').that
        .is.empty;

      expect(
        removed.map(({ uri }) => uri),
        `Only the specified folder must be removed`,
      ).to.deep.equal([folderUri]);
    },
  );

  expect(
    workspace.updateWorkspaceFolders(folder.index, 1),
    `Closing the folder '${folderUri.fsPath}' operation must be successful`,
  ).to.be.true;
  await workspaceFoldersChange;
}

async function resetCommandConfig(): Promise<void> {
  const folders = workspace.workspaceFolders ?? [];
  const { executableCache } = await getTestingApi();

  for (const folder of folders) {
    const configuration = workspace.getConfiguration(CONFIG_SECTION, folder);
    const setting = configuration.inspect<string>(CONFIG_COMMAND_KEY);

    if (setting?.workspaceFolderValue === undefined) {
      continue;
    }

    const folderConfigurationChange = promisifyEvent(
      workspace.onDidChangeConfiguration,
    );
    const executableRemoved = executableCache.workspaceFolders.has(folder)
      ? promisifyEvent(executableCache.onDidRemoveExecutable)
      : Promise.resolve();

    await configuration.update(
      CONFIG_COMMAND_KEY,
      undefined,
      ConfigurationTarget.WorkspaceFolder,
    );
    await folderConfigurationChange;
    await executableRemoved;
  }

  const executableCommand = getExecutablePath();

  const configuration = workspace.getConfiguration(CONFIG_SECTION);
  const setting = configuration.inspect<string>(CONFIG_COMMAND_KEY);
  let globalValue, workspaceValue;

  if (setting !== undefined) {
    ({ globalValue, workspaceValue } = setting);
  }

  if (workspaceValue !== undefined) {
    const workspaceConfigurationChange = promisifyEvent(
      workspace.onDidChangeConfiguration,
    );
    const executableRemoved = promisifyEvent(
      executableCache.onDidRemoveExecutable,
    );

    await configuration.update(
      CONFIG_COMMAND_KEY,
      undefined,
      ConfigurationTarget.Workspace,
    );
    await workspaceConfigurationChange;
    await executableRemoved;
  }

  if (globalValue !== executableCommand) {
    if (executableCache.global._onDidSetCommand === undefined) {
      expect.fail(`The executable command setting events must be available`);
    }

    const globalConfigurationChange = promisifyEvent(
      executableCache.global._onDidSetCommand,
    );

    await configuration.update(
      CONFIG_COMMAND_KEY,
      executableCommand,
      ConfigurationTarget.Global,
    );
    await globalConfigurationChange;
  }
}

async function resetWorkspaceFolders(): Promise<void> {
  const actualWorkspaceFolders = getWorkspaceFolders();

  const appendedCount =
    actualWorkspaceFolders.length - INITIAL_WORKSPACE_FOLDERS.length;

  expect(
    appendedCount,
    'Test workspace folders are only allowed to be appended',
  ).to.be.at.least(0);

  if (appendedCount === 0) {
    return;
  }

  const workspaceFoldersChange = promisifyEvent(
    workspace.onDidChangeWorkspaceFolders,
  );

  expect(
    workspace.updateWorkspaceFolders(
      INITIAL_WORKSPACE_FOLDERS.length,
      appendedCount,
    ),
    'The appended workspace folders must be removed correctly',
  ).to.be.true;

  await workspaceFoldersChange;
}

const statusChangeAvailableAssertion: TFiredEventAssertion<
  Executable['onDidChangeStatus']
> = function ({ errorCode }) {
  expect(errorCode, 'The executable must be available').to.be.undefined;
};
const statusChangeUnavailableAssertion: TFiredEventAssertion<
  Executable['onDidChangeStatus']
> = function ({ errorCode }) {
  expect(errorCode, 'The executable must be unavailable').to.not.be.undefined;
};

type TConfigurationAffectedAssertion<
  T extends typeof workspace.onDidChangeConfiguration =
    typeof workspace.onDidChangeConfiguration,
> = (
  ...parameters: TConfigurationAffectedParameters<T>
) => TFiredEventAssertion<T>;

type TConfigurationAffectedParameters<
  T extends typeof workspace.onDidChangeConfiguration =
    typeof workspace.onDidChangeConfiguration,
> =
  Parameters<TFiredEventAssertion<T>> extends [infer E]
    ? E extends ConfigurationChangeEvent
      ? Parameters<E['affectsConfiguration']>
      : never
    : never;

const configurationAffectedAssertion: TConfigurationAffectedAssertion =
  function (...parameters) {
    return function (event): void {
      expect(
        event.affectsConfiguration(...parameters),
        'The configuration must be affected by the change',
      ).to.be.true;
    };
  };

function findProtolintDiagnostic(
  diagnostics: ProtolintDiagnostic[],
  rule: string,
  expectedRange: Range,
): ProtolintDiagnostic {
  const diagnostic = diagnostics.find(
    ({ code, range }) =>
      typeof code === 'object' &&
      code.value === rule &&
      range.isEqual(expectedRange),
  );

  if (diagnostic === undefined) {
    expect.fail(`There must be a diagnostic for the rule '${rule}'`);
  }
  diagnostic.code;

  return diagnostic;
}

async function getCodeActions(
  uri: Uri,
  expectedRange: Range,
): Promise<CodeAction[]> {
  return commands.executeCommand<CodeAction[]>(
    'vscode.executeCodeActionProvider',
    uri,
    expectedRange,
  );
}

function getDiagnosticCodes(uri: Uri): string[] {
  const diagnostics = languages
    .getDiagnostics(uri)
    .filter(({ source }) => source === DIAGNOSTIC_SOURCE);
  const codes: string[] = [];

  for (const { code } of diagnostics) {
    if (typeof code === 'string') {
      codes.push(code);
    }
    if (
      typeof code === 'object' &&
      'value' in code &&
      typeof code.value === 'string'
    ) {
      codes.push(code.value);
    }
  }

  return codes;
}

async function getDiagnostics(
  document: TextDocument,
): Promise<ProtolintDiagnostic[]> {
  await executeCommand(COMMAND_LINT_DOCUMENTS, [document]);

  const diagnostics = languages
    .getDiagnostics(document.uri)
    .filter(({ source }) => source === DIAGNOSTIC_SOURCE);

  expect(diagnostics, `Protolint diagnostics should exist`).to.be.an.an('array')
    .that.is.not.empty;

  if (!diagnostics.every((item) => item instanceof ProtolintDiagnostic)) {
    expect.fail(
      `All '${DIAGNOSTIC_SOURCE}' diagnostics must be '${ProtolintDiagnostic.name}' instances`,
    );
  }

  return diagnostics;
}

async function getTargetDiagnostics(
  uri: Uri,
  targetCodes: readonly string[],
): Promise<string[]> {
  const { promise, resolve } = Promise.withResolvers<string[]>();
  const disposable = languages.onDidChangeDiagnostics(({ uris }) => {
    if (
      uris.map((item) => item.toString()).includes(uri.toString()) &&
      JSON.stringify(getDiagnosticCodes(uri)) === JSON.stringify(targetCodes)
    ) {
      disposable.dispose();
      resolve(getDiagnosticCodes(uri));
    }
  });

  return promise;
}

async function setDocumentText(
  uri: Uri,
  text: string,
  save: boolean,
): Promise<void> {
  const document = await workspace.openTextDocument(uri);

  const edit = new WorkspaceEdit();

  edit.replace(
    uri,
    document
      .lineAt(0)
      .range.with(undefined, document.lineAt(document.lineCount - 1).range.end),
    text,
  );

  await workspace.applyEdit(edit);

  if (uri.scheme === 'file' && save) {
    await workspace.save(uri);
  }
}

const { FIX_KEY, PROTOLINT_QUICK_FIX } = testing;

type TExpectedActions = (
  uri: Uri,
  diagnostic: ProtolintDiagnostic,
) => CodeAction[];

function extractText(message: TParsedMessage, property: string): string {
  if (message[property] === undefined) {
    expect.fail(`${property} must be set`);
  }

  return message[property];
}

const replaceCodeAction: TExpectedActions = function (
  uri,
  { parsedMessage, range },
) {
  const action = new CodeAction('', PROTOLINT_QUICK_FIX);

  action.isPreferred = true;
  action.edit = new WorkspaceEdit();
  action.edit.replace(uri, range, extractText(parsedMessage, FIX_KEY));

  return [action];
};

const deleteCodeAction: TExpectedActions = function (uri, { range }) {
  const action = new CodeAction('', PROTOLINT_QUICK_FIX);

  action.isPreferred = true;
  action.edit = new WorkspaceEdit();
  action.edit.delete(uri, range);

  return [action];
};

const fixAllIndentsAction: TExpectedActions = function () {
  const action = new CodeAction('', PROTOLINT_QUICK_FIX);

  action.isPreferred = true;
  action.command = {
    arguments: undefined,
    command: EDITOR_COMMAND_FIX_INDENTS,
    title: 'Fix all indents',
  };

  return [action];
};

const fixIndentActions: TExpectedActions = function (uri, diagnostic) {
  const fixIndent = new CodeAction('', PROTOLINT_QUICK_FIX);

  fixIndent.isPreferred = undefined;
  fixIndent.edit = new WorkspaceEdit();
  fixIndent.edit.replace(
    uri,
    diagnostic.range,
    extractText(diagnostic.parsedMessage, FIX_KEY),
  );

  return [...fixAllIndentsAction(uri, diagnostic), fixIndent];
};

const enumFieldAppendAction: TExpectedActions = function (
  uri,
  { parsedMessage, range: { end } },
) {
  const suffix = '_' + extractText(parsedMessage, FIX_KEY);

  const action = new CodeAction('', PROTOLINT_QUICK_FIX);

  action.isPreferred = true;
  action.edit = new WorkspaceEdit();
  action.edit.insert(uri, end, suffix);

  return [action];
};

const enumFieldPrependAction: TExpectedActions = function (
  uri,
  { parsedMessage, range: { start } },
) {
  const prefix = extractText(parsedMessage, FIX_KEY) + '_';
  const action = new CodeAction('', PROTOLINT_QUICK_FIX);

  action.isPreferred = true;
  action.edit = new WorkspaceEdit();
  action.edit.insert(uri, start, prefix);

  return [action];
};

const renameFileAction: TExpectedActions = function (uri, { parsedMessage }) {
  const fixedUri = Uri.joinPath(uri, '..', extractText(parsedMessage, FIX_KEY));

  /** This is to populate an internal {@link Uri} property with the correct value.
   *
   * @see {@link https://github.com/microsoft/vscode/issues/224064}
   *
   * Due to some reason the issue isn't reproduced via `macos-latest` OS in
   * GitHub Actions.
   */
  if (process.platform !== 'darwin') {
    fixedUri.toString();
  }

  const action = new CodeAction('', PROTOLINT_QUICK_FIX);

  action.isPreferred = true;
  action.edit = new WorkspaceEdit();

  action.edit.renameFile(uri, fixedUri, {
    overwrite: false,
  });

  return [action];
};

interface IRuleTest {
  actionIndexes: readonly number[];
  expectedCodeActions: TExpectedActions;
  expectedParsedMessage: TParsedMessage;
  expectedRange: Range;
  rule: string;
  rulePostfix: string;
}

async function closeDocuments(): Promise<void> {
  for (const document of workspace.textDocuments) {
    await window.showTextDocument(document, { preview: false });
    await commands.executeCommand('workbench.action.closeActiveEditor');
  }
}

async function codeActionAssertion(
  { actionIndexes, expectedCodeActions, expectedRange, rule }: IRuleTest,
  uri: Uri,
  actualDiagnostic: ProtolintDiagnostic,
): Promise<void> {
  const actualActions = await getCodeActions(uri, expectedRange);
  const assertableActions = actualActions
    .filter((action) => action.kind?.contains(PROTOLINT_QUICK_FIX) === true)
    .filter((_action, index) => actionIndexes.includes(index));
  const expectedActions = expectedCodeActions(uri, actualDiagnostic);

  expect(
    assertableActions,
    `The number of returned Code Actions must be correct`,
  ).to.have.lengthOf(expectedActions.length);

  for (const [index, action] of assertableActions.entries()) {
    Object.defineProperty(action, 'title', { value: '' });

    expect(
      action,
      `The Code Action with index ${index.toString()} for rule '${rule}' must be correct`,
    ).to.deep.equal(expectedActions[index]);
  }
}

async function getReflection({ uri }: TextDocument): Promise<IReflection> {
  const mirror = await DocumentMirror.getInstance();
  const methodName = mirror.reflect.name;
  const reflection = await mirror.reflect(uri, false);

  if (reflection.result === 'error') {
    expect.fail(
      `${methodName} returned error: ` + JSON.stringify(reflection.error),
    );
  }

  return reflection.value;
}

export type { IRuleTest, TFiredEventAssertion };
export {
  appendWorkspaceFolders,
  closeDocuments,
  codeActionAssertion,
  configurationAffectedAssertion,
  DEBUG_TIMEOUT,
  debugTimeout,
  deleteCodeAction,
  enumFieldAppendAction,
  enumFieldPrependAction,
  findProtolintDiagnostic,
  fixAllIndentsAction,
  fixIndentActions,
  FIXTURES_DIRECTORY,
  getDiagnosticCodes,
  getDiagnostics,
  getExecutablePath,
  getFolderExecutable,
  getReflection,
  getSetCommandEvent,
  getTargetDiagnostics,
  getTestingApi,
  getWorkspaceExecutable,
  getWorkspaceFolder,
  getWorkspaceFolders,
  INVALID_EXECUTABLE_COMMAND,
  PROJECT_ROOT,
  promisifyEvent,
  removeWorkspaceFolder,
  renameFileAction,
  replaceCodeAction,
  resetCommandConfig,
  resetWorkspaceFolders,
  RULES_FIXTURE,
  RULES_FIXTURE_BASENAME,
  setDocumentText,
  statusChangeAvailableAssertion,
  statusChangeUnavailableAssertion,
};
