import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { text } from 'node:stream/consumers';

import { EventEmitter, ExtensionMode, window } from 'vscode';

import { DocumentMirror } from './document-mirror.js';
import { isNodeError } from './helpers.js';
import { Measure } from './performance.js';

import type {
  ExecFileException,
  SpawnOptionsWithoutStdio,
} from 'node:child_process';

import type { Disposable, QuickPickItem, Uri } from 'vscode';

import type { TAutoDisableMode, TResult } from './constants.js';
import type { IReflectionError } from './document-mirror.js';
import type { TWriteable } from './helpers.js';

const AUTOFIX_METHOD = 'autofix' as const;
const PROTOLINT_RUN_TIMEOUT = 5000;
const UNKNOWN_VERSION = 'unknown';

/**
 * `protolint` execution error codes.
 */
enum ExecuteErrorCode {
  Access = 'EXECUTABLE_NO_ACCESS',
  Scheme = 'INCORRECT_TARGET_SCHEME',
  Terminated = 'PROCESS_TERMINATED',
  Unavailable = 'EXECUTABLE_UNAVAILABLE',
  Unknown = 'EXECUTE_UNKNOWN_ERROR',
}

/**
 * `protolint`
 * {@link https://github.com/yoheimuta/protolint/blob/v0.44.0/README.md#exit-codes exit codes}.
 */
enum ProtolintExitCode {
  /** Linting was successful and there should be no diagnostics in this document. */
  Clear = 0,

  /** Linting was successful and diagnostics should be set for the document. */
  LintFlags = 1,

  /**
   * Linting was unsuccessful due to all other errors, such as protobuf parsing,
   * internal, and runtime problems.
   */
  OtherErrors = 2,
}

function isProtolintExitCode(value: unknown): value is ProtolintExitCode {
  return (
    typeof value === 'number' &&
    Object.values(ProtolintExitCode).includes(value)
  );
}

function isSpawnError(value: unknown): value is { code: string } & Error {
  return (
    value instanceof Error && 'code' in value && typeof value.code === 'string'
  );
}

/**
 * {@link DocumentMirror} is applied before calling the target, so that the
 * target uses the current document text reflection.
 */
function mirrored<
  This extends Executable = Executable,
  Return extends ReturnType<
    Executable['lint' | typeof AUTOFIX_METHOD]
  > = ReturnType<Executable['lint' | typeof AUTOFIX_METHOD]>,
>(
  target: (this: This, ...arguments_: TExecuteSignature) => Return,
  _context: ClassMethodDecoratorContext<
    This,
    (this: This, ...arguments_: TExecuteSignature) => Return
  >,
) {
  async function replacementMethod(
    this: This,
    ...arguments_: TExecuteSignature
  ): Promise<
    | Awaited<Return>
    | TResult<never, IExecuteError>
    | TResult<never, IReflectionError>
  > {
    if (this.status.errorCode !== undefined) {
      await this.refreshStatus();
    }

    if (this.status.errorCode !== undefined) {
      return {
        error: { code: this.status.errorCode },
        result: 'error',
      };
    }

    const [uri, configPath, , autoDisable] = arguments_;
    const mirror = await DocumentMirror.getInstance();
    const reflection = await mirror.reflect(
      uri,
      target.name === AUTOFIX_METHOD,
    );

    if (reflection.result === 'error') {
      return reflection;
    }

    await using disposable = reflection.value;
    const { cwd, fileUri } = disposable;

    return await target.call(this, fileUri, configPath, cwd, autoDisable);
  }

  return replacementMethod;
}

const runExecutable: TRunExecutable = async function (
  ...arguments_
): Promise<TResult<IExecuteResult, IExecuteError>> {
  const process = spawn(...arguments_);

  const stderr = text(process.stderr);
  const stdout = text(process.stdout);

  try {
    const [exitCode] = (await once(process, 'exit')) as unknown[];

    if (exitCode === null) {
      return {
        error: { code: ExecuteErrorCode.Terminated },
        result: 'error',
      };
    }

    if (!isProtolintExitCode(exitCode)) {
      return {
        error: { code: ExecuteErrorCode.Unknown },
        result: 'error',
      };
    }

    switch (exitCode) {
      case ProtolintExitCode.Clear:
        return {
          result: 'success',
          value: { exitCode, stdout: await stdout },
        };

      case ProtolintExitCode.LintFlags:
      case ProtolintExitCode.OtherErrors:
        return {
          result: 'success',
          value: { exitCode, stderr: await stderr },
        };
    }
  } catch (error) {
    let code = ExecuteErrorCode.Unknown;

    if (!isSpawnError(error)) {
      return {
        error: { code },
        result: 'error',
      };
    }

    switch (error.code) {
      case 'EACCES':
        code = ExecuteErrorCode.Access;
        break;

      case 'ENOENT':
        code = ExecuteErrorCode.Unavailable;
        break;

      default:
        code = ExecuteErrorCode.Unknown;
        break;
    }

    return {
      error: { code, error },
      result: 'error',
    };
  }
};

enum AutofixErrorCodes {
  Canceled = 'CANCELED_BY_USER',
  OtherErrors = 'OTHER_ERRORS',
  ReadfileError = 'READFILE_ERROR',
  Unknown = 'UNKNOWN_EXIT_CODE',
}

/**
 * `protolint` output format.
 *
 * {@link https://github.com/yoheimuta/protolint/blob/v0.46.1/README.md#reporters}
 */
enum ReportFormat {
  Json = 'json',
  Junit = 'junit',
  Plain = 'plain',
  Sarif = 'sarif',
  Sonar = 'sonar',
  Unix = 'unix',
}

interface IAutofix {
  /**
   * Runs `protolint lint -fix`.
   */
  [AUTOFIX_METHOD]: (
    ...arguments_: TExecuteSignature
  ) => Promise<TResult<IAutofixResult, IAutofixError | TExecuteMirroredError>>;
}

interface IAutofixError {
  /**
   * Autofix error code.
   */
  code: AutofixErrorCodes;
  error?: NodeJS.ErrnoException | null;
  stderr?: string;
}

interface IAutofixOptions extends QuickPickItem {
  autoDisable?: TAutoDisableMode;
}

interface IAutofixResult {
  /**
   * The document text after the autofix.
   */
  fixedText?: string;
}

interface IExecutableStatus {
  errorCode?: ExecuteErrorCode;
  version: string;
}

interface IExecuteError {
  code: ExecuteErrorCode;
  error?: ExecFileException;
}

/**
 * An outcome of using `protolint` via Node.js child process.
 * Only covers cases when the executable was executed and the known
 * exit code value.
 */
interface IExecuteResult {
  /**
   * The operation exit code.
   */
  exitCode: ProtolintExitCode;

  /**
   * The operation `stderr`.
   */
  stderr?: string;

  /**
   * The operation `stdout`.
   */
  stdout?: string;
}

interface ILint {
  /**
   * Runs `protolint lint`.
   */
  lint: (
    ...arguments_: TExecuteSignature
  ) => Promise<TResult<IExecuteResult, TExecuteMirroredError>>;
}

type TArguments<T extends TArgumentsOptions = TArgumentsOptions> = T extends [
  infer Arguments,
  ...infer _Rest,
]
  ? TWriteable<Arguments>
  : never;

type TArgumentsOptions<T extends TRunExecutable = TRunExecutable> =
  Parameters<T> extends [infer _Command, ...infer Rest]
    ? [...rest: Rest]
    : never;

type TCwd = Pick<SpawnOptionsWithoutStdio, 'cwd'>;

type TExecuteMirroredError = IExecuteError | IReflectionError;

/**
 * Ordered parameters for calling `protolint`.
 */
type TExecuteSignature = [
  /**
   * The target document URI
   */
  uri: Uri,

  /**
   * `protolint` config file path
   */
  configPath: string | undefined,

  /**
   * CWD for running `protolint` process.
   * @defaultValue as in {@link spawn}.
   */
  cwd?: string,

  /**
   * `-auto_disable` mode for `protolint -fix`
   */
  mode?: TAutoDisableMode,
];

type TRunExecutable<T extends typeof spawn = typeof spawn> =
  Parameters<T> extends [infer Command, infer Arguments, ...infer _Rest]
    ? (
        command: Command,
        arguments_: Arguments,
        options: SpawnOptionsWithoutStdio,
      ) => Promise<TResult<IExecuteResult, IExecuteError>>
    : never;

/**
 * Represents one `protolint` executable.
 *
 * If the executable command/path is correct, provides linting and autofixing.
 */
class Executable implements Disposable, IAutofix, ILint {
  private static _extensionMode: ExtensionMode;

  /**
   * Fires an event when the {@link command} is set for the `protolint`
   * executable.
   *
   * Please use for tests only.
   * @eventProperty
   */
  get _onDidSetCommand(): EventEmitter<IExecutableStatus>['event'] | undefined {
    return this.#commandSetEvents?.event;
  }

  /**
   * The command value for running `protolint`. Can be either command or path
   * to the `protolint` executable file.
   *
   * @example
   * ```text
   * protolint
   * ```
   * @example
   * ```text
   * /usr/bin/protolint
   * ```
   */
  get command(): string {
    return this.#command;
  }

  /**
   * Fires an event when the {@link status} is changed for the `protolint`
   * executable.
   *
   * @eventProperty
   */
  get onDidChangeStatus(): EventEmitter<IExecutableStatus>['event'] {
    return this.#statusEvents.event;
  }

  /**
   * The executable status.
   *
   * The status is updated lazily, only when {@link setCommand} or
   * {@link refreshStatus} is called.
   *
   * Failure in {@link lint} or {@link autofix} operation may cause the status
   * refresh.
   */
  get status(): IExecutableStatus {
    return {
      errorCode: this.#errorCode,
      version: this.#version,
    };
  }

  #command: string;
  #commandSetEvents?: EventEmitter<IExecutableStatus>;
  #errorCode?: ExecuteErrorCode;
  readonly #statusEvents = new EventEmitter<IExecutableStatus>();
  #version: string = UNKNOWN_VERSION;

  private constructor(command: string) {
    this.#command = command;
  }

  /**
   * Creates a new Executable and refreshes its {@link status}.
   *
   * Multiple independent instances can be created.
   *
   * @param command The value for {@link Executable.command}
   * @returns A promise Promise that resolves after the status has been
   * refreshed.
   */
  public static async createInstance(command: string): Promise<Executable> {
    const instance = new Executable(command);

    await instance.refreshStatus();
    if (this._extensionMode === ExtensionMode.Test) {
      instance.#commandSetEvents ??= new EventEmitter<IExecutableStatus>();
    }

    return instance;
  }

  /**
   * Set the mode for all class instances. {@link ExtensionMode.Test} enables
   * additional events for the tests.
   *
   * @param extensionMode The desired mode
   */
  public static setMode(extensionMode: ExtensionMode): void {
    this._extensionMode = extensionMode;
  }

  @mirrored
  async autofix(
    uri: Uri,
    configPath?: string,
    cwd?: string,
    autoDisable?: TAutoDisableMode,
  ): Promise<TResult<IAutofixResult, IAutofixError | TExecuteMirroredError>> {
    if (autoDisable === undefined) {
      const item = await window.showQuickPick<IAutofixOptions>(
        [
          {
            autoDisable: undefined,
            description: `Don't disable problems reported by auto-disable rules`,
            label: 'No auto disable',
            picked: true,
          },
          {
            autoDisable: 'next',
            description: `Add the disable comments applying to the next line`,
            label: 'Auto disable: next',
          },
          {
            autoDisable: 'this',
            description: `Add the disable comments applying to the current line`,
            label: 'Auto disable: this',
          },
        ],
        {
          placeHolder: 'Select autofix options',
          title: 'protolint autofix',
        },
      );

      if (item === undefined) {
        return { error: { code: AutofixErrorCodes.Canceled }, result: 'error' };
      }

      ({ autoDisable } = item);
    }

    using measure = new Measure('info', `Autofix ${uri.toString()}`);
    const arguments_ = ['lint', '-fix'];

    if (autoDisable && autoDisable !== 'none') {
      arguments_.push(`-auto_disable=${autoDisable}`);
    }

    const result = await this._withConfig(uri, configPath, arguments_, {
      cwd,
    });

    if (result.result === 'error') {
      return result;
    }

    switch (result.value.exitCode) {
      case ProtolintExitCode.Clear:
        return { result: 'success', value: {} };

      case ProtolintExitCode.LintFlags: {
        let fixedText;

        try {
          const prefixedText = await readFile(uri.fsPath, {
            encoding: 'utf8',
          });
          const lines = prefixedText.split('\n');

          lines.shift();

          fixedText = lines.join('\n');

          measure.end();
        } catch (error) {
          return {
            error: {
              code: AutofixErrorCodes.ReadfileError,
              ...(isNodeError(error) && { error }),
            },
            result: 'error',
          };
        }

        return {
          result: 'success',
          value: { fixedText },
        };
      }

      case ProtolintExitCode.OtherErrors:
        return {
          error: {
            code: AutofixErrorCodes.OtherErrors,
            stderr: result.value.stderr,
          },
          result: 'error',
        };

      default:
        return {
          error: {
            code: AutofixErrorCodes.Unknown,
          },
          result: 'error',
        };
    }
  }

  dispose(): void {
    this.#statusEvents.dispose();
    this.#commandSetEvents?.dispose();
  }

  @mirrored
  async lint(
    uri: Uri,
    configPath?: string,
    cwd?: string,
  ): Promise<TResult<IExecuteResult, IExecuteError | TExecuteMirroredError>> {
    const arguments_ = ['lint', '-reporter', ReportFormat.Json];

    return this._withConfig(uri, configPath, arguments_, { cwd });
  }

  async setCommand(value: string): Promise<IExecutableStatus> {
    this.#command = value;

    await this.refreshStatus();
    this.#commandSetEvents?.fire(this.status);

    return this.status;
  }

  protected async refreshStatus(): Promise<void> {
    const run = await this._withOptions(['version']);
    let errorCode: ExecuteErrorCode | undefined;

    if (run.result === 'error') {
      errorCode = run.error.code;
    }

    let version;

    if (run.result === 'success' && run.value.stdout !== undefined) {
      [, version] =
        /^protolint version (\d+\.\d+\.\d+)/.exec(run.value.stdout) ?? [];
    }

    this._setStatus(errorCode, version);
  }

  private _setStatus(
    errorCode?: ExecuteErrorCode,
    version: string = UNKNOWN_VERSION,
  ) {
    if (this.#version !== version || this.#errorCode !== errorCode) {
      this.#version = version;
      this.#errorCode = errorCode;
      this.#statusEvents.fire({ errorCode, version });
    }
  }

  private async _withConfig(
    { fsPath, scheme }: Uri,
    configPath: string | undefined,
    ...arguments_: Parameters<typeof this._withStatus>
  ): ReturnType<typeof this._withStatus> {
    if (scheme !== 'file') {
      return { error: { code: ExecuteErrorCode.Scheme }, result: 'error' };
    }

    const [spawnArguments] = arguments_;

    if (configPath !== undefined && configPath) {
      spawnArguments.push(`-config_path=${configPath}`);
    }

    spawnArguments.push(fsPath);

    return this._withStatus(...arguments_);
  }

  private async _withExecutable(
    ...arguments_: TArgumentsOptions
  ): Promise<Awaited<ReturnType<typeof runExecutable>>> {
    if (this.#command === '') {
      return {
        error: { code: ExecuteErrorCode.Unavailable },
        result: 'error',
      };
    }

    return runExecutable(this.#command, ...arguments_);
  }

  private async _withOptions(
    arguments_: TArguments,
    cwd?: TCwd,
  ): Promise<Awaited<ReturnType<typeof this._withExecutable>>> {
    return this._withExecutable(arguments_, {
      ...cwd,
      timeout: PROTOLINT_RUN_TIMEOUT,
    });
  }

  private async _withStatus(
    ...arguments_: Parameters<typeof this._withOptions>
  ): Promise<Awaited<ReturnType<typeof this._withOptions>>> {
    const result = await this._withOptions(...arguments_);

    if (result.result === 'error') {
      this._setStatus(result.error.code);
    }

    if (result.result === 'success' && this.#errorCode !== undefined) {
      await this.refreshStatus();
    }

    return result;
  }
}

export { Executable, ExecuteErrorCode, ProtolintExitCode };
