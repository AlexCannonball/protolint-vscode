import { commands, Uri, window, workspace } from 'vscode';

import { CONFIG_BASENAME } from './constants.js';
import { logger } from './logger.js';

import type { TextEditor, Event as TypedEvent } from 'vscode';

import type { TExtensionCommands, TResult } from './constants.js';

enum LocateExecutableErrorCode {
  Dismiss = 'DIALOG_DISMISSED',
}

interface ILocateExecutableError {
  code: LocateExecutableErrorCode;
}

/**
 * Extracts a listener type from {@link TypedEvent}.
 */
type TExtractListener<T extends TypedEvent<unknown>> =
  Parameters<T> extends [infer Listener, ...infer _Rest] ? Listener : never;

type TRegisterCommand = typeof commands.registerCommand extends (
  command: infer Command,
  callback: infer Callback,
  thisArgument?: infer ThisArgument,
) => infer Result
  ? <CommandName extends Command & keyof TExtensionCommands>(
      command: CommandName,
      handler: TExtensionCommands[CommandName] extends Callback
        ? TExtensionCommands[CommandName]
        : never,
      thisArgument?: ThisArgument,
    ) => Result
  : never;

/**
 * Removes `readonly` for all {@link T} properties.
 */
type TWriteable<T> = { -readonly [P in keyof T]: T[P] };

/**
 * Applies VS Code native reindent command according to the protobuf style
 * guide.
 *
 * @param param0 The text editor to reindent
 */
async function fixIndents({ options }: TextEditor): Promise<void> {
  options.insertSpaces = true;
  options.tabSize = 2;

  try {
    await commands.executeCommand('editor.action.reindentlines');
  } catch (error) {
    logger.error('[Reindent] Unsuccessful indent fix attempt:', error);
  }
}

/**
 * Uses a system file open dialog to select `protolint` executable.
 * @returns the absolute path of the selected file
 */
async function locateExecutable(): Promise<
  TResult<string, ILocateExecutableError>
> {
  const userInput = await window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: 'Use for linting',
  });

  if (userInput === undefined || userInput.length === 0) {
    return {
      error: {
        code: LocateExecutableErrorCode.Dismiss,
      },
      result: 'error',
    };
  }

  const [{ fsPath: value }] = userInput;

  return {
    result: 'success',
    value,
  };
}

/**
 * Type support wrapper for {@link commands.registerCommand} arguments in this
 * extension.
 */
const registerCommand: TRegisterCommand = function (...arguments_) {
  return commands.registerCommand(...arguments_);
};

type TExecuteCommand = typeof commands.executeCommand extends (
  command: infer Command,
  ...rest: infer Rest
) => infer Result
  ? <
      CommandName extends Command & keyof TExtensionCommands,
      Handler extends (
        ...arguments_: never[]
      ) => unknown = TExtensionCommands[CommandName],
    >(
      command: CommandName,
      ...rest: Parameters<Handler> extends Rest ? Parameters<Handler> : never
    ) => ReturnType<Handler> extends Awaited<Result>
      ? Thenable<ReturnType<Handler>>
      : never
  : never;

/**
 * Type support wrapper for {@link commands.executeCommand} arguments in this
 * extension.
 */
const executeCommand: TExecuteCommand = function (...arguments_) {
  return commands.executeCommand(...arguments_);
};

/**
 * If a `protolint` config file exists in the Workspace Folder root, returns
 * this file absolute path.
 *
 * @param uri The document URI for which the config search is being performed
 */
async function getConfigPath(uri: Uri): Promise<string | undefined> {
  const workspaceFolder = workspace.getWorkspaceFolder(uri);

  if (workspaceFolder === undefined) {
    return;
  }

  const configUri = Uri.joinPath(workspaceFolder.uri, CONFIG_BASENAME);

  try {
    await workspace.fs.stat(configUri);
  } catch {
    return;
  }

  return configUri.fsPath;
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error;
}

export type { TExtractListener, TWriteable };
export {
  executeCommand,
  fixIndents,
  getConfigPath,
  isNodeError,
  locateExecutable,
  registerCommand,
};
