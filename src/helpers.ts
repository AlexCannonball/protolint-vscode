import { commands, window } from 'vscode';

import { WARNING_STATE_KEY } from './constants.js';
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

async function clearDeprecationWarningState({
  globalState,
}: ExtensionContext): Promise<void> {
  const lastShownVersion = globalState.get<string>(WARNING_STATE_KEY);

  if (lastShownVersion !== undefined) {
    // eslint-disable-next-line unicorn/no-useless-undefined
    await globalState.update(WARNING_STATE_KEY, undefined);
  }
}

export type { TExtractListener, TWriteable };
export {
  clearDeprecationWarningState,
  executeCommand,
  fixIndents,
  locateExecutable,
  registerCommand,
};
