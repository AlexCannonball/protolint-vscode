import {
  commands,
  Diagnostic,
  DiagnosticSeverity,
  languages,
  TextDocumentChangeReason,
  Uri,
  window,
  workspace,
} from 'vscode';

import { ExecutableCache } from './config.js';
import {
  COMMAND_LINT_DOCUMENTS,
  CONFIG_GLOB,
  DIAGNOSTIC_SOURCE,
  DIAGNOSTICS_COLLECTION_NAME,
  EDITOR_COMMAND_LINT,
  PROTOBUF_SELECTOR,
  RUNTIME_ERROR_CODE,
} from './constants.js';
import { ProtolintExitCode } from './executable.js';
import { registerCommand } from './helpers.js';
import { parseJsonStderr } from './json-report-parser.js';
import { logger } from './logger.js';
import { Measure } from './performance.js';
import { ProtolintDiagnostic } from './rule-mapper.js';
import { runtimeErrorRange } from './runtime-error.js';

import type { ExtensionContext, TextDocument } from 'vscode';

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

    const watcher = workspace.createFileSystemWatcher(CONFIG_GLOB);

    const handleConfigChange = function (configUri: Uri, eventType: string) {
      logger.trace(
        `[File watcher] Config ${eventType} event:`,
        configUri.toString(),
      );

      diagnostics.processConfigChange(configUri);
    };

    disposables.push(watcher);
    watcher.onDidCreate(
      (configUri) => handleConfigChange(configUri, 'create'),
      undefined,
      disposables,
    );
    watcher.onDidChange(
      (configUri) => handleConfigChange(configUri, 'change'),
      undefined,
      disposables,
    );
    watcher.onDidDelete(
      (configUri) => handleConfigChange(configUri, 'delete'),
      undefined,
      disposables,
    );

    workspace.onDidCloseTextDocument(
      (document) => {
        if (!languages.match(PROTOBUF_SELECTOR, document)) {
          return;
        }

        const { uri } = document;

        logger.trace(
          `[Diagnostics] Document close event, deleting diagnostics:`,
          uri.toString(),
        );

        this._diagnosticCollection.delete(uri);
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
        const affectedFolders = [...added, ...removed].map(
          (folder) => folder.uri.toString() + '/',
        );

        const affectedDocuments = workspace.textDocuments.filter(
          ({ uri }) =>
            this._diagnosticCollection.has(uri) &&
            affectedFolders.some((folder) => uri.toString().startsWith(folder)),
        );

        for (const document of affectedDocuments) {
          await diagnostics.refresh(document);
        }
      },
      undefined,
      disposables,
    );
  }

  processConfigChange(configUri: Uri): void {
    const dirname = Uri.joinPath(configUri, '..').toString() + '/';

    const affectedDocuments = workspace.textDocuments.filter(
      ({ uri }) =>
        Diagnostics._diagnosticCollection.has(uri) &&
        uri.toString().startsWith(dirname),
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
      lint = await this.#executableCache.getExecutable(uri).lint(document);
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
          logger.error(`[Diagnostics] ${message}`);

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
          logger.error(`[Diagnostics] ${message}`, parse.error);

          return;
        }
        const diagnostics = parse.value.map(
          (error) => new ProtolintDiagnostic(document, error),
        );

        Diagnostics._diagnosticCollection.set(uri, diagnostics);

        return;
      }
    }
  }
}

export { Diagnostics };
