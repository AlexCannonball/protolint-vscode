import {
  commands,
  Diagnostic,
  DiagnosticSeverity,
  languages,
  TextDocumentChangeReason,
  window,
  workspace,
} from 'vscode';

import { ExecutableCache } from './config.js';
import {
  COMMAND_LINT_DOCUMENTS,
  CONFIG_BASENAME,
  DIAGNOSTIC_SOURCE,
  DIAGNOSTICS_COLLECTION_NAME,
  EDITOR_COMMAND_LINT,
  PROTOBUF_SELECTOR,
  RUNTIME_ERROR_CODE,
} from './constants.js';
import { DocumentMirror } from './document-mirror.js';
import { ProtolintExitCode } from './executable.js';
import { getConfigPath, registerCommand } from './helpers.js';
import { parseJsonStderr } from './json-report-parser.js';
import { logger } from './logger.js';
import { Measure } from './performance.js';
import { ProtolintDiagnostic } from './rule-mapper.js';
import { runtimeErrorRange } from './runtime-error.js';

import type { ExtensionContext, TextDocument, WorkspaceFolder } from 'vscode';

/**
 * Manages diagnostics produced by `protolint`.
 *
 * You can't instantiate more than one {@link Diagnostics}.
 */
class Diagnostics {
  private static readonly _diagnosticCollection =
    languages.createDiagnosticCollection(DIAGNOSTICS_COLLECTION_NAME);
  private static _instance: Diagnostics | undefined;

  readonly #executableCache: ExecutableCache;

  private constructor(executableCache: ExecutableCache) {
    this.#executableCache = executableCache;
  }

  /**
   * Instantiates diagnostics for `protolint`.
   *
   * @param context {@link ExtensionContext} for this extension.
   */
  public static async initialize(context: ExtensionContext): Promise<void> {
    if (this._instance) {
      return;
    }

    const { subscriptions: disposables } = context;
    const diagnostics = new Diagnostics(
      await ExecutableCache.getInstance(context),
    );

    this._instance = diagnostics;

    disposables.push(
      this._diagnosticCollection,
      commands.registerTextEditorCommand(
        EDITOR_COMMAND_LINT,
        ({ document }) => {
          void diagnostics.refresh(document);
        },
      ),
    );

    if (window.activeTextEditor) {
      const { document } = window.activeTextEditor;

      void diagnostics.refresh(document);
    }

    disposables.push(
      registerCommand(COMMAND_LINT_DOCUMENTS, async function (documents) {
        const uniqueDocuments = [...new Set(documents)];

        return Promise.allSettled(
          uniqueDocuments.map(async (document) =>
            diagnostics.refresh(document),
          ),
        );
      }),
    );

    const watcher = workspace.createFileSystemWatcher(`**/${CONFIG_BASENAME}`);

    disposables.push(watcher);
    watcher.onDidCreate(
      (configUri) => {
        logger.trace(
          `[File watcher] '${CONFIG_BASENAME}' create event:`,
          configUri.toString(),
        );

        diagnostics.processConfigChange(
          workspace.getWorkspaceFolder(configUri),
        );
      },
      undefined,
      disposables,
    );
    watcher.onDidChange(
      (configUri) => {
        logger.trace(
          `[File watcher] '${CONFIG_BASENAME}' change event:`,
          configUri.toString(),
        );

        diagnostics.processConfigChange(
          workspace.getWorkspaceFolder(configUri),
        );
      },
      undefined,
      disposables,
    );
    watcher.onDidDelete(
      (configUri) => {
        logger.trace(
          `[File watcher] '${CONFIG_BASENAME}' delete event:`,
          configUri.toString(),
        );

        diagnostics.processConfigChange(
          workspace.getWorkspaceFolder(configUri),
        );
      },
      undefined,
      disposables,
    );

    workspace.onDidCloseTextDocument(
      async (document) => {
        if (!languages.match(PROTOBUF_SELECTOR, document)) {
          return;
        }

        const { uri } = document;

        logger.trace(
          `[Diagnostics] Document close event, deleting diagnostics:`,
          uri.toString(),
        );

        this._diagnosticCollection.delete(uri);

        const mirror = await DocumentMirror.getInstance();

        await mirror.closeDocument(document);
      },
      undefined,
      disposables,
    );

    // Refresh the diagnostics including when the document language is changed
    // to protocol buffers.
    workspace.onDidOpenTextDocument(
      async (document) => {
        if (languages.match(PROTOBUF_SELECTOR, document)) {
          logger.trace(
            `[Diagnostics] Document open event, refreshing diagnostics:`,
            document.uri.toString(),
          );
        }

        await diagnostics.refresh(document);
      },
      undefined,
      disposables,
    );

    workspace.onDidChangeTextDocument(
      async ({
        contentChanges: { length },
        document,
        document: { isDirty, uri, version },
        reason,
      }) => {
        if (languages.match(PROTOBUF_SELECTOR, document)) {
          const reasonText =
            reason === undefined ? '-' : TextDocumentChangeReason[reason];

          logger.trace(
            `[Diagnostics] Document change event (${length.toString()} changes, is dirty: ${isDirty.toString()}, version: ${version.toString()}, reason: ${reasonText}):`,
            uri.toString(),
          );
        }

        if (
          length ||
          reason === TextDocumentChangeReason.Redo ||
          reason === TextDocumentChangeReason.Undo
        ) {
          await diagnostics.refresh(document);
        }
      },
      undefined,
      disposables,
    );

    workspace.onDidRenameFiles(
      ({ files }) => {
        logger.trace(`[Diagnostics] Rename event for file(s):`, files);

        for (const { oldUri } of files) {
          this._diagnosticCollection.delete(oldUri);
        }
      },
      undefined,
      disposables,
    );

    workspace.onDidChangeWorkspaceFolders(
      async ({ added, removed }) => {
        const mirror = await DocumentMirror.getInstance();

        await mirror.changeWorkspaceFolders({ added, removed });

        const affectedFolders = [...added, ...removed];
        const affectedDocuments = workspace.textDocuments
          .filter(({ uri }) => this._diagnosticCollection.has(uri))
          .filter(({ uri: documentUri }) =>
            affectedFolders.some(({ uri: folderUri }) =>
              documentUri.toString().startsWith(folderUri.toString()),
            ),
          );

        for (const document of affectedDocuments) {
          void diagnostics.refresh(document);
        }
      },
      undefined,
      disposables,
    );
  }

  processConfigChange(workspaceFolder: undefined | WorkspaceFolder): void {
    if (workspaceFolder === undefined) {
      return;
    }

    const affectedDocuments = workspace.textDocuments
      .filter(({ uri }) => Diagnostics._diagnosticCollection.has(uri))
      .filter(
        ({ uri }) => workspace.getWorkspaceFolder(uri) === workspaceFolder,
      );

    for (const document of affectedDocuments) {
      void this.refresh(document);
    }
  }

  /**
   * Refreshes diagnostics for a document.
   *
   * If the document is not identified as protocol buffer, the diagnostics won't
   * be refreshed.
   *
   * @param document A document to get the diagnostics refreshed.
   */
  async refresh(document: TextDocument): Promise<void> {
    if (!languages.match(PROTOBUF_SELECTOR, document)) {
      return;
    }

    const { uri } = document;

    if (!document.getText()) {
      Diagnostics._diagnosticCollection.set(uri, []);

      return;
    }

    using measure = new Measure('info', `Lint ${uri.toString()}`);
    let lint;

    try {
      lint = await this.#executableCache
        .getExecutable(uri)
        .lint(uri, await getConfigPath(uri));
    } catch (error) {
      logger.error(
        `[Diagnostics] Failed linting ${uri.toString()}. Details:`,
        error,
      );

      return;
    }

    measure.end();

    if (lint.result === 'error') {
      logger.error(
        `[Diagnostics] Failed refreshing diagnostics ${uri.toString()}. Details:`,
        lint,
      );

      return;
    }

    const {
      value: { exitCode, stderr },
    } = lint;

    switch (exitCode) {
      case ProtolintExitCode.Clear:
        Diagnostics._diagnosticCollection.set(uri, []);

        return;

      case ProtolintExitCode.LintFlags:
      case ProtolintExitCode.OtherErrors: {
        if (stderr === undefined) {
          const message = `stderr wasn't provided with protolint exit code: ${exitCode.toString()}`;

          void window.showErrorMessage(message);
          logger.error(`[Diagnostics] ` + message);

          return;
        }

        if (exitCode === ProtolintExitCode.OtherErrors) {
          // Errors have a special format in this case, so `runtimeErrorRange`
          // should be used.
          const range = runtimeErrorRange(document, stderr);
          const diagnostic = new Diagnostic(
            range.result === 'success' ? range.value : document.lineAt(0).range,
            stderr.trim(),
            DiagnosticSeverity.Error,
          );

          diagnostic.source = DIAGNOSTIC_SOURCE;
          diagnostic.code = RUNTIME_ERROR_CODE;

          Diagnostics._diagnosticCollection.set(uri, [diagnostic]);

          return;
        }

        const parse = parseJsonStderr(stderr);

        if (parse.result === 'error') {
          const message = `Failed to parse protolint stderr due to an error: ${parse.error.code}`;

          void window.showErrorMessage(message);
          logger.error(`[Diagnostics] ` + message, parse.error);

          return;
        }
        const diagnostics = parse.value.map(
          (error) => new ProtolintDiagnostic(document, error),
        );

        Diagnostics._diagnosticCollection.set(uri, diagnostics);

        return;
      }

      // undefined or unexpected exit code value.
      default: {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        const message = `Protolint returned an unexpected exit code ${exitCode}. Can't refresh errors`;

        void window.showErrorMessage(message);
        logger.error(`[Diagnostics] ` + message);

        return;
      }
    }
  }
}

export { Diagnostics };
