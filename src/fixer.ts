import {
  CodeActionKind,
  commands,
  languages,
  Range,
  window,
  workspace,
  WorkspaceEdit,
} from 'vscode';

import { ExecutableCache } from './config.js';
import {
  AUTO_DISABLE_MODES,
  EDITOR_COMMAND_AUTOFIX,
  EDITOR_COMMAND_FIX_INDENTS,
  PROTOBUF_SELECTOR,
} from './constants.js';
import { fixIndents, getConfigPath } from './helpers.js';
import { logger } from './logger.js';
import { codeActions, ProtolintDiagnostic } from './rule-mapper.js';

import type {
  CodeAction,
  CodeActionContext,
  CodeActionProvider,
  ExtensionContext,
  Selection,
  TextDocument,
} from 'vscode';

import type { TAutoDisableMode } from './constants.js';

class ProtolintActionProvider implements CodeActionProvider {
  public static readonly providedCodeActionKinds = [CodeActionKind.QuickFix];

  provideCodeActions(
    document: TextDocument,
    range: Range | Selection,
    { diagnostics, only }: CodeActionContext,
  ): CodeAction[] {
    if (only && only.value !== CodeActionKind.QuickFix.value) {
      return [];
    }

    const actions: CodeAction[] = [];
    const actionableDiagnostics = diagnostics
      .filter((diagnostic) => diagnostic instanceof ProtolintDiagnostic)
      .filter((diagnostic) => diagnostic.range.contains(range));

    for (const diagnostic of actionableDiagnostics) {
      actions.push(...codeActions(document, diagnostic));
    }

    return actions;
  }
}

function isAutoDisable(argument: unknown): argument is TAutoDisableMode {
  return (
    typeof argument === 'string' &&
    AUTO_DISABLE_MODES.includes(argument as TAutoDisableMode)
  );
}

/**
 * Manages fixing code issues performed by `protolint`.
 *
 * You can't instantiate more than one {@link Fixer}.
 */
class Fixer {
  private static _instance: Fixer | undefined;

  readonly #executableCache: ExecutableCache;

  private constructor(executableCache: ExecutableCache) {
    this.#executableCache = executableCache;
  }

  /**
   * Instantiates code fixing for `protolint`.
   *
   * @param context {@link ExtensionContext} for this extension.
   */
  public static async initialize(context: ExtensionContext): Promise<void> {
    if (this._instance) {
      return;
    }

    const fixer = new Fixer(await ExecutableCache.getInstance(context));

    this._instance = fixer;

    const { subscriptions: disposables } = context;

    disposables.push(
      commands.registerTextEditorCommand(
        EDITOR_COMMAND_FIX_INDENTS,
        (editor) => {
          void fixIndents(editor);
        },
      ),

      languages.registerCodeActionsProvider(
        PROTOBUF_SELECTOR,
        new ProtolintActionProvider(),
        {
          providedCodeActionKinds:
            ProtolintActionProvider.providedCodeActionKinds,
        },
      ),

      commands.registerTextEditorCommand(
        EDITOR_COMMAND_AUTOFIX,
        (editor, _edit, ...arguments_) => {
          const autoDisable = arguments_.find((item) => isAutoDisable(item));

          void fixer.apply(editor.document, autoDisable);
        },
      ),
    );
  }

  async apply(
    document: TextDocument,
    autoDisable?: TAutoDisableMode,
  ): Promise<void> {
    if (!languages.match(PROTOBUF_SELECTOR, document)) {
      return;
    }

    let autofix;
    const { lineCount, uri } = document;

    try {
      autofix = await this.#executableCache
        .getExecutable(uri)
        .autofix(uri, await getConfigPath(uri), undefined, autoDisable);
    } catch (error) {
      logger.error(
        `[Fixer] Failed autofixing ${uri.toString()} via temp file. Details:`,
        error,
      );

      return;
    }

    if (autofix.result === 'error') {
      logger.error(`[Fixer] Failed autofixing ${uri.toString()}:`, autofix);

      return;
    }

    const {
      value: { fixedText },
    } = autofix;

    if (fixedText === undefined) {
      void window.showInformationMessage('Protolint: no errors to autofix');

      return;
    }

    const editText = new WorkspaceEdit();
    const range = new Range(
      document.lineAt(0).range.start,
      document.lineAt(lineCount - 1).range.end,
    );

    editText.replace(uri, range, fixedText);

    try {
      const applied = await workspace.applyEdit(editText);

      if (!applied) {
        logger.error(
          `[Fixer] Failed applying the autofixed text to ${uri.toString()}`,
        );
      }
    } catch (error) {
      logger.error(
        `[Fixer] Applying the edit with an autofix to ${uri.toString()} is rejected:`,
        error,
      );
    }
  }
}

export { Fixer };
