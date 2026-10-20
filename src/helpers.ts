import { commands, Uri, window, workspace } from 'vscode';

import { CONFIG_BASENAME, WARNING_STATE_KEY } from './constants.js';
import { logger } from './logger.js';

import type { ExtensionContext, TextEditor, Event as TypedEvent } from 'vscode';

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
  const [uri] =
    (await window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: 'Use for linting',
    })) ?? [];

  if (uri === undefined) {
    return {
      error: {
        code: LocateExecutableErrorCode.Dismiss,
      },
      result: 'error',
    };
  }

  return {
    result: 'success',
    value: uri.fsPath,
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
      Handler extends (...arguments_: never[]) => unknown =
        TExtensionCommands[CommandName],
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

async function showDeprecationWarningIfNeeded(
  context: ExtensionContext,
): Promise<void> {
  const currentVersion = (context.extension.packageJSON as { version: string })
    .version;

  const lastShownVersion = context.globalState.get<string>(WARNING_STATE_KEY);

  if (lastShownVersion === currentVersion) {
    return;
  }

  const readButton = 'Read Migration Guide';
  const message =
    'Upcoming Breaking Change: protolint extension will soon drop support for protolint binary versions prior to v0.58.0.';

  const selection = await window.showWarningMessage(message, readButton);

  if (selection === readButton) {
    const guideUri = Uri.joinPath(
      context.extensionUri,
      'docs',
      'stdin-migration.md',
    );

    try {
      await commands.executeCommand('markdown.showPreview', guideUri);
    } catch {
      const guide = await workspace.openTextDocument(guideUri);

      await window.showTextDocument(guide);
    }
  }

  await context.globalState.update(WARNING_STATE_KEY, currentVersion);
}

export type { TExtractListener, TWriteable };
export {
  executeCommand,
  fixIndents,
  getConfigPath,
  isNodeError,
  locateExecutable,
  registerCommand,
  showDeprecationWarningIfNeeded,
};
