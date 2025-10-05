import path from 'node:path';

import {
  commands,
  ConfigurationTarget,
  env,
  EventEmitter,
  Uri,
  window,
  workspace,
} from 'vscode';

import {
  COMMAND_FIX_EXECUTABLE_COMMAND,
  COMMAND_LINT_DOCUMENTS,
  CONFIG_SECTION,
  EDITOR_COMMAND_LINT,
  FAILOVER_PROTOLINT_COMMAND,
  PROTOLINT_REPO_URI,
} from './constants.js';
import { Executable } from './executable.js';
import {
  executeCommand,
  locateExecutable,
  registerCommand,
} from './helpers.js';
import { logger } from './logger.js';

import type {
  Disposable,
  Event,
  ExtensionContext,
  QuickPickItem,
  WorkspaceConfiguration,
  WorkspaceFolder,
} from 'vscode';

import type { TResult } from './constants.js';

/**
 * `protolint` command configuration key in VS Code Settings.
 */
const CONFIG_COMMAND_KEY = 'command';
/**
 * `protolint` command VS Code name.
 */
const CONFIG_COMMAND_SECTION = `${CONFIG_SECTION}.${CONFIG_COMMAND_KEY}`;

enum ConfigurationTargetErrorCode {
  NotFound = 'EXECUTABLE_NOT_FOUND',
}

/**
 * Represents a VS Code configuration target to update settings for a particular
 * executable in the cache. Use {@link configuration}'s
 * {@link WorkspaceConfiguration.update} function to update the setting.
 */
interface IConfigurationTarget {
  configuration: WorkspaceConfiguration;
  folder?: WorkspaceFolder;
  target: ConfigurationTarget;
}

interface IConfigurationTargetError {
  code: ConfigurationTargetErrorCode;
}

interface IFixCommandAction extends QuickPickItem {
  action?: TFixCommandAction;
}

type TFixCommandAction = (executable: Executable) => Thenable<unknown>;

/**
 * Manages the cache of `protolint` executable(s):
 * - Syncs `protolint` executable command with VS Code Settings and opened
 * Workspace Folders.
 * - Provides the command {@link COMMAND_FIX_EXECUTABLE_COMMAND} for fixing an
 * incorrect `protolint` command.
 * - Guarantees that only one cache is instantiated.
 *
 * Please use {@link ExecutableCache.getInstance} to get the cache object.
 */
class ExecutableCache implements Disposable {
  private static _instance: ExecutableCache | undefined;
  readonly global;

  /**
   * Fires an event when a new {@link Executable} was created in the cache.
   * @eventProperty
   */
  public get onDidCreateExecutable(): Event<Executable> {
    return this.#createExecutableEvents.event;
  }

  /**
   * Fires an event when an {@link Executable} was removed from the cache.
   * @eventProperty
   */
  public get onDidRemoveExecutable(): Event<undefined> {
    return this.#removeExecutableEvents.event;
  }

  /**
   * {@link Executable} configured via Workspace settings.
   */
  public get workspace(): Executable | undefined {
    return this.#workspace;
  }

  /**
   * {@link Executable}s configured via Workspace Folder settings.
   */
  public get workspaceFolders(): ReadonlyMap<WorkspaceFolder, Executable> {
    return this.#workspaceFolders;
  }

  readonly #createExecutableEvents = new EventEmitter<Executable>();
  readonly #removeExecutableEvents = new EventEmitter<undefined>();

  #workspace: Executable | undefined;
  readonly #workspaceFolders = new Map<WorkspaceFolder, Executable>();

  private constructor(
    { subscriptions: disposables }: ExtensionContext,
    globalExecutable: Executable,
  ) {
    this.global = globalExecutable;

    disposables.push(
      this,
      registerCommand(
        COMMAND_FIX_EXECUTABLE_COMMAND,
        (executable) => void this._fixCommand(executable),
      ),
    );

    workspace.onDidChangeWorkspaceFolders(
      ({ added, removed }) => {
        void this._addFolders(added);

        this._removeFolders(removed);
      },
      undefined,
      disposables,
    );

    workspace.onDidChangeConfiguration(
      async (event) => {
        if (!event.affectsConfiguration(CONFIG_COMMAND_SECTION)) {
          return;
        }

        const reset = this.#workspaceFolders
          .keys()
          .filter(
            (folder) =>
              workspace
                .getConfiguration(CONFIG_SECTION, folder)
                .inspect<string>(CONFIG_COMMAND_KEY)?.workspaceFolderValue ===
              undefined,
          );
        const affectedFolders =
          workspace.workspaceFolders?.filter((folder) =>
            event.affectsConfiguration(CONFIG_COMMAND_SECTION, folder),
          ) ?? [];

        await this._load([...new Set([...affectedFolders, ...reset])]);

        const affectedDocuments = workspace.textDocuments.filter((document) =>
          event.affectsConfiguration(CONFIG_COMMAND_SECTION, document),
        );

        void executeCommand(COMMAND_LINT_DOCUMENTS, affectedDocuments);
      },
      undefined,
      disposables,
    );
  }

  /**
   * Prepares and returns a ready-to-use executable cache instance.
   *
   * You can't instantiate more than one executable cache.
   *
   * @param context The executable context. This parameter is ignored after the
   * first successful function call.
   */
  public static async getInstance(
    context: ExtensionContext,
  ): Promise<ExecutableCache> {
    if (ExecutableCache._instance) {
      return ExecutableCache._instance;
    }

    const configuration = workspace.getConfiguration(CONFIG_SECTION);
    const setting = configuration.inspect<string>(CONFIG_COMMAND_KEY);
    const globalCommand =
      setting?.globalValue ??
      setting?.defaultValue ??
      FAILOVER_PROTOLINT_COMMAND;

    ExecutableCache._instance = new ExecutableCache(
      context,
      await Executable.createInstance(globalCommand),
    );

    await ExecutableCache._instance._load(workspace.workspaceFolders ?? []);

    return ExecutableCache._instance;
  }

  dispose(): void {
    this.#createExecutableEvents.dispose();
    this.#removeExecutableEvents.dispose();

    for (const [, executable] of this.#workspaceFolders) {
      executable.dispose();
    }

    this.#workspace?.dispose();
    this.global.dispose();
  }

  /**
   * Picks an executable for the specified URI.
   *
   * @param uri The URI that `protolint` should work with.
   * @returns `protolint` configured for the specified URI.
   */
  getExecutable(uri: Uri): Executable {
    const workspaceFolder = workspace.getWorkspaceFolder(uri);
    let executable;

    if (workspaceFolder) {
      executable = this.#workspaceFolders.get(workspaceFolder);
    }

    executable ??= this.#workspace ?? this.global;

    return executable;
  }

  private async _addFolders(
    folders: readonly WorkspaceFolder[],
  ): Promise<void> {
    for (const folder of folders) {
      const configuration = workspace.getConfiguration(CONFIG_SECTION, folder);

      const setting =
        configuration.inspect<string>(CONFIG_COMMAND_KEY)?.workspaceFolderValue;

      if (setting === undefined) {
        this._removeFolders([folder]);

        continue;
      }

      const executable = this.#workspaceFolders.get(folder);
      const resolvedPath = resolvePath(setting, folder.uri.fsPath);

      await executable?.setCommand(resolvedPath);

      if (executable === undefined) {
        const instance = await Executable.createInstance(resolvedPath);

        this.#workspaceFolders.set(folder, instance);

        this.#createExecutableEvents.fire(instance);
      }
    }
  }

  private async _findExecutable(executable: Executable) {
    let result;

    try {
      result = await locateExecutable();
    } catch (error) {
      logger.error(
        `[Config] Failed locating protolint executable via open dialog:`,
        error,
      );

      return;
    }

    if (result.result === 'error') {
      return;
    }

    const { errorCode } = await executable.setCommand(result.value);

    if (errorCode !== undefined) {
      return;
    }

    void commands.executeCommand(EDITOR_COMMAND_LINT);

    const configurationTarget = this._getConfigurationTarget(executable);

    if (configurationTarget.result === 'error') {
      return;
    }

    const { configuration, folder, target } = configurationTarget.value;

    let destination = ConfigurationTarget[target];

    if (folder !== undefined) {
      destination += `: '${folder.name}'`;
    }

    try {
      await configuration.update(
        CONFIG_COMMAND_KEY,
        executable.command,
        target,
      );
    } catch (error) {
      logger.error(
        `[Config] Failed saving the fixed executable command to ${destination} Settings:`,
        error,
      );
    }
  }

  private async _fixCommand(executable: Executable): Promise<void> {
    const item = await window.showQuickPick<IFixCommandAction>(
      [
        {
          action: () => env.openExternal(Uri.parse(PROTOLINT_REPO_URI, true)),
          description: 'Download the linter executable',
          label: 'Download',
        },
        {
          action: () =>
            commands.executeCommand('workbench.action.openSettings2', {
              query: `${CONFIG_SECTION}.${CONFIG_COMMAND_KEY}`,
            }),
          description: 'Set the executable command in Settings',
          label: 'Fix in Settings',
        },
        {
          action: this._findExecutable.bind(this),
          description: 'Find the executable via the file explorer',
          label: 'Find',
        },
      ],
      {
        placeHolder: 'Select an action',
        title: 'Fix the linter executable command',
      },
    );

    await item?.action?.(executable);
  }

  private _getConfigurationTarget(
    executable: Executable,
  ): TResult<IConfigurationTarget, IConfigurationTargetError> {
    for (const [folder, folderExecutable] of this.#workspaceFolders.entries()) {
      if (executable === folderExecutable) {
        return {
          result: 'success',
          value: {
            configuration: workspace.getConfiguration(CONFIG_SECTION, folder),
            folder,
            target: ConfigurationTarget.WorkspaceFolder,
          },
        };
      }
    }

    const configuration = workspace.getConfiguration(CONFIG_SECTION);

    if (executable === this.#workspace) {
      return {
        result: 'success',
        value: {
          configuration,
          target: ConfigurationTarget.Workspace,
        },
      };
    }

    if (executable === this.global) {
      return {
        result: 'success',
        value: {
          configuration,
          target: ConfigurationTarget.Global,
        },
      };
    }

    return {
      error: {
        code: ConfigurationTargetErrorCode.NotFound,
      },
      result: 'error',
    };
  }

  private async _load(folders: readonly WorkspaceFolder[]): Promise<void> {
    const configuration = workspace.getConfiguration(CONFIG_SECTION);
    const setting = configuration.inspect<string>(CONFIG_COMMAND_KEY);
    const globalValue =
      setting?.globalValue ??
      setting?.defaultValue ??
      FAILOVER_PROTOLINT_COMMAND;

    if (globalValue && this.global.command !== globalValue) {
      await this.global.setCommand(globalValue);
    }

    await this._addFolders(folders);

    if (setting?.workspaceValue === undefined) {
      if (this.#workspace !== undefined) {
        this.#workspace.dispose();
        this.#workspace = undefined;
        // eslint-disable-next-line unicorn/no-useless-undefined
        this.#removeExecutableEvents.fire(undefined);
      }

      return;
    }

    if (this.#workspace === undefined) {
      this.#workspace = await Executable.createInstance(setting.workspaceValue);
      this.#createExecutableEvents.fire(this.#workspace);

      return;
    }

    if (this.#workspace.command !== setting.workspaceValue) {
      await this.#workspace.setCommand(setting.workspaceValue);
    }
  }

  private _removeFolders(folders: readonly WorkspaceFolder[]): void {
    for (const folder of folders) {
      this.#workspaceFolders.get(folder)?.dispose();

      if (this.#workspaceFolders.delete(folder)) {
        // eslint-disable-next-line unicorn/no-useless-undefined
        this.#removeExecutableEvents.fire(undefined);
      }
    }
  }
}

/**
 * If provided with a relative path in {@link value}, returns an absolute path
 * resolved against {@link directory}.
 * Absolute paths in {@link value} are set as is.
 *
 * @param value The path to set. Can be absolute or relative. A relative path
 * must start with `.` character.
 * @param directory Relative path in {@link value} is resolved against this
 * path. Must be absolute, otherwise ignored.
 */
function resolvePath(value: string, directory: string): string {
  return path.isAbsolute(directory) && value.startsWith('.')
    ? path.resolve(directory, value)
    : value;
}

export { CONFIG_COMMAND_KEY, CONFIG_COMMAND_SECTION, ExecutableCache };
