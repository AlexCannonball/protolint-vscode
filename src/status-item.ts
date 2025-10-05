import { languages, LanguageStatusSeverity, window } from 'vscode';

import { ExecutableCache } from './config.js';
import {
  COMMAND_FIX_EXECUTABLE_COMMAND,
  PROTOBUF_SELECTOR,
} from './constants.js';
import { ExecuteErrorCode } from './executable.js';
import { executeCommand } from './helpers.js';

import type {
  Disposable,
  ExtensionContext,
  LanguageStatusItem,
  TextEditor,
} from 'vscode';

import type { TExtensionCommands } from './constants.js';
import type { Executable } from './executable.js';
import type { TExtractListener } from './helpers.js';

function accessMessage(_executable: Executable) {
  return window.showErrorMessage(`Failed to access protolint executable.
    Please configure permissions in OS.`);
}

/**
 * Shows an error message with a button to fix the executable command.
 *
 * @param executable An executable to which the fixing action should be applied.
 */
async function unavailableMessage(executable: Executable) {
  const FIX_COMMAND_ACTIONS = 'Fix the problem';

  const selection = await window.showErrorMessage(
    `Protolint executable was not detected.
    Fix it now or go back to fixing via the language status item later.`,
    FIX_COMMAND_ACTIONS,
  );

  if (selection === FIX_COMMAND_ACTIONS) {
    void executeCommand(COMMAND_FIX_EXECUTABLE_COMMAND, executable);
  }
}

const STATUS_TEXT = 'protolint';
const STATUS_DETAIL_UNAVAILABLE = 'executable unavailable';

interface IStatus {
  detail: string;
  fixer?: (executable: Executable) => Thenable<unknown>;
}

const STATUS_MAP: Record<ExecuteErrorCode, IStatus> = {
  [ExecuteErrorCode.Access]: {
    detail: 'executable access error',
    fixer: accessMessage,
  },
  [ExecuteErrorCode.Scheme]: {
    detail: 'attempt to lint the incorrect file URI',
  },
  [ExecuteErrorCode.Terminated]: {
    detail: 'linter process terminated due to timeout',
  },
  [ExecuteErrorCode.Unavailable]: {
    detail: STATUS_DETAIL_UNAVAILABLE,
    fixer: unavailableMessage,
  },
  [ExecuteErrorCode.Unknown]: {
    detail: 'unknown error',
  },
};

type TExecutableStatus =
  TExtractListener<TExecutableStatusEvent> extends (
    event: infer Event,
  ) => unknown
    ? Event
    : never;

type TExecutableStatusEvent = Executable['onDidChangeStatus'];

/**
 * Class for managing a {@link LanguageStatusItem} instance for the extension.
 *
 * Use {@link createInstance} to setup the {@link LanguageStatusItem} instance.
 */
class LanguageStatusUpdater implements Disposable {
  private static _instance: LanguageStatusUpdater | undefined;
  #disposable?: ReturnType<TExecutableStatusEvent>;
  #errorMessageShown: boolean;
  #executable?: Executable;
  readonly #executableCache: ExecutableCache;
  readonly #languageStatusItem: LanguageStatusItem;

  private constructor(
    { subscriptions: disposables }: ExtensionContext,
    executableCache: ExecutableCache,
  ) {
    this.#languageStatusItem = languages.createLanguageStatusItem(
      'protolint',
      PROTOBUF_SELECTOR,
    );

    this.#languageStatusItem.text = STATUS_TEXT;

    this.#errorMessageShown = false;

    this.#executableCache = executableCache;

    this.#attach(window.activeTextEditor);
    disposables.push(this);

    window.onDidChangeActiveTextEditor(
      (editor) => this.#attach(editor),
      undefined,
      disposables,
    );

    this.#executableCache.onDidRemoveExecutable(
      () => this.#attach(window.activeTextEditor),
      undefined,
      disposables,
    );

    this.#executableCache.onDidCreateExecutable(
      () => this.#attach(window.activeTextEditor),
      undefined,
      disposables,
    );
  }

  /**
   * Creates a {@link LanguageStatusItem} for the extension.
   *
   * @param context The extension context.
   *
   * @returns The created {@link LanguageStatusItem}.
   */
  public static async createInstance(
    context: ExtensionContext,
  ): Promise<LanguageStatusItem> {
    LanguageStatusUpdater._instance ??= new LanguageStatusUpdater(
      context,
      await ExecutableCache.getInstance(context),
    );

    return LanguageStatusUpdater._instance.#languageStatusItem;
  }

  dispose(): void {
    this.#disposable?.dispose();
    this.#disposable = undefined;

    this.#languageStatusItem.dispose();

    LanguageStatusUpdater._instance = undefined;
  }

  #attach(editor: TextEditor | undefined): void {
    if (editor && languages.match(PROTOBUF_SELECTOR, editor.document)) {
      this.#listen(this.#executableCache.getExecutable(editor.document.uri));
    }
  }

  #listen(executable: Executable): void {
    if (executable === this.#executable) {
      return;
    }

    this.#disposable?.dispose();

    this.#executable = executable;

    this.#disposable = this.#executable.onDidChangeStatus(
      this.#statusListener.bind(this),
    );

    this.#statusListener(this.#executable.status);
  }

  #statusListener({ errorCode, version }: TExecutableStatus): void {
    if (this.#executable === undefined) {
      return;
    }

    if (errorCode === undefined) {
      this.#languageStatusItem.severity = LanguageStatusSeverity.Information;
      this.#languageStatusItem.detail = version;
      this.#languageStatusItem.command = undefined;

      return;
    }

    this.#languageStatusItem.detail = STATUS_MAP[errorCode].detail;
    this.#languageStatusItem.severity = LanguageStatusSeverity.Error;

    const arguments_: Parameters<
      TExtensionCommands[typeof COMMAND_FIX_EXECUTABLE_COMMAND]
    > = [this.#executable];

    this.#languageStatusItem.command =
      errorCode === ExecuteErrorCode.Unavailable
        ? {
            arguments: arguments_,
            command: COMMAND_FIX_EXECUTABLE_COMMAND,
            title: 'Fix the executable',
          }
        : undefined;

    const { fixer } = STATUS_MAP[errorCode];

    if (!this.#errorMessageShown && fixer !== undefined) {
      this.#errorMessageShown = true;

      void fixer(this.#executable);
    }
  }
}

export { LanguageStatusUpdater, STATUS_DETAIL_UNAVAILABLE, STATUS_TEXT };
