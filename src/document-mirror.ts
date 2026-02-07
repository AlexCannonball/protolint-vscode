import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Uri, workspace } from 'vscode';

import { isNodeError } from './helpers.js';
import { logger } from './logger.js';
import { Measure } from './performance.js';

import type {
  TextDocument,
  Disposable as VsDisposable,
  WorkspaceFolder,
  WorkspaceFoldersChangeEvent,
} from 'vscode';

import type { TResult } from './constants.js';

enum DocumentReflectionErrorCode {
  Document = 'NO_DOCUMENT_FOR_URI',
  NestedDirectory = 'FAILED_MAKING_NESTED_DIRECTORY',
  TemporaryDirectory = 'FAILED_MAKING_TEMPORARY_DIRECTORY',
  TemporaryFile = 'FAILED_MAKING_TEMPORARY_FILE',
  TemporaryRoot = 'FAILED_MAKING_TEMPORARY_ROOT',
}

interface IChangeFolders {
  /**
   * Processes Workspace Folders changes.
   *
   * @param event A Workspace Folders change event to be processed.
   */
  changeWorkspaceFolders: (event: WorkspaceFoldersChangeEvent) => Promise<void>;
}

interface ICwd {
  /**
   * cwd for executing `protolint`.
   */
  cwd: string;
}

/**
 * A file system directory containing reflected documents with
 * {@link Disposable} implementation for `using` statement.
 */
interface IDisposableDirectory extends AsyncDisposable, ICwd {}

/**
 * An {@link IDocumentSnapshot} with its parent directory available to dispose.
 */
interface IDisposableSnapshot extends IDocumentSnapshot {
  /**
   * A {@link Disposable} parent directory for the document snapshot.
   */
  directory: IDisposableDirectory;
}

/**
 * Represents a particular document version successfully reflected.
 */
interface IDocumentSnapshot extends IFileUri, Pick<TextDocument, 'version'> {
  /**
   * The path of the document's {@link WorkspaceFolder} relative to the
   * outermost {@link WorkspaceFolder}.
   */
  nestedDirectories: string;
}

interface IFileUri {
  /**
   * The file URI of the reflected document.
   */
  fileUri: Uri;
}

/**
 * An {@link IDisposableSnapshot} associated with its outermost
 * {@link WorkspaceFolder}.
 */
interface IFolderAssociation extends IDisposableSnapshot {
  /**
   * The outermost {@link WorkspaceFolder} associated with the document
   * snapshot.
   */
  outermostFolder?: WorkspaceFolder;
}

/**
 * The object providing cwd and an absolute file path to lint via `protolint`.
 *
 * Please manage this with `using` keyword to properly dispose temporary files.
 */
interface IReflection extends IDisposableDirectory, IFileUri {}

/**
 * An error occurred during the reflection operation in {@link DocumentMirror}.
 */
interface IReflectionError {
  code: DocumentReflectionErrorCode;
  error?: NodeJS.ErrnoException | null;
}

/**
 * `protolint` works only with files and doesn't provide reading a text via
 * `stdin` or LSP.
 *
 * The only way to make lint-on-type via `protolint` is creating files with
 * unsaved text edits.
 *
 * {@link DocumentMirror} manages temporary files that reflect unsaved document
 * texts and prevents the original file in-place edits via `protolint -fix`.
 *
 * The temporary files are located in the system temporary directory.
 *
 * You can't instantiate more than one {@link DocumentMirror}.
 */
class DocumentMirror implements IChangeFolders, VsDisposable {
  /**
   * The file system directory for keeping the {@link DocumentMirror}
   * temporary files.
   */
  public static readonly rootDirectory = path.join(tmpdir(), 'protolint');
  private static _instance: DocumentMirror | undefined;

  readonly #documents = new Map<TextDocument, IFolderAssociation>();
  readonly #folders = new Map<WorkspaceFolder, IDisposableDirectory>();

  private constructor() {
    logger.info(
      `[Document mirror] Using the temporary files directory:`,
      DocumentMirror.rootDirectory,
    );
  }

  /**
   * Removes previously added temporary files before instantiating.
   *
   * @returns The prepared {@link DocumentMirror} instance.
   */
  public static async getInstance(): Promise<DocumentMirror> {
    if (this._instance) {
      return this._instance;
    }

    try {
      await rm(this.rootDirectory, { recursive: true });
    } catch (error) {
      if ((isNodeError(error) && error.code) !== 'ENOENT') {
        logger.error(
          `[Document mirror] Failed cleaning the temporary files directory ${this.rootDirectory}:`,
          error,
        );
      }
    }

    this._instance = new DocumentMirror();

    return this._instance;
  }

  /**
   * Synchronizes the state of {@link DocumentMirror} with changes in
   * Workspace Folders.
   */
  async changeWorkspaceFolders({
    added,
    removed,
  }: WorkspaceFoldersChangeEvent): Promise<void> {
    await this._removeFolders(removed);

    const current = new Set(this.#folders.keys());
    const target = new Set(getOutermostFolders());
    const turnedInnerFolders = current.difference(target);

    await this._removeFolders([...turnedInnerFolders]);

    const depthAscending = added.toSorted(
      ({ uri: a }, { uri: b }) => a.toString().length - b.toString().length,
    );

    for (const folder of depthAscending) {
      for (const [document, file] of this.#documents) {
        const outermostFolder = getOutermostFolder(document.uri);

        if (
          file.outermostFolder === undefined &&
          outermostFolder !== undefined
        ) {
          file.outermostFolder = outermostFolder;
        }

        if (workspace.getWorkspaceFolder(document.uri) === folder) {
          updateNestedDirectories(document, file);
        }
      }
    }
  }

  /**
   * Synchronizes the state of {@link DocumentMirror} with a document closure.
   *
   * @param closedDocument The closed text document
   */
  async closeDocument(closedDocument: TextDocument): Promise<void> {
    for (const [document, file] of this.#documents) {
      if (closedDocument === document && file.outermostFolder === undefined) {
        await file.directory[Symbol.asyncDispose]();
      }
    }

    this.#documents.delete(closedDocument);
  }

  dispose(): void {
    void this._removeFolders();
  }

  /**
   * If a text document content is modified, creates a temporary file with the
   * current document text.
   *
   * @param uri The URI of the text document to reflect
   * @param autofix If `true`, creates a special temporary file to prevent the
   * original file from in-place changes by `protolint`.
   */
  async reflect(
    uri: Uri,
    autofix: boolean,
  ): Promise<TResult<IReflection, IReflectionError>> {
    const document = workspace.textDocuments.find(
      ({ uri: documentUri }) => documentUri === uri,
    );

    if (document === undefined) {
      return {
        error: { code: DocumentReflectionErrorCode.Document },
        result: 'error',
      };
    }

    const {
      isDirty,
      uri: { fsPath, scheme },
      version,
    } = document;

    using measure = new Measure('info', `Reflecting ${uri.toString()}`);

    const persist = !autofix && (scheme === 'file' || scheme === 'untitled');

    if (persist && !isDirty && version === 1) {
      return {
        result: 'success',
        value: {
          cwd:
            workspace.getWorkspaceFolder(uri)?.uri.fsPath ??
            path.dirname(fsPath),
          fileUri: uri,
          [Symbol.asyncDispose]: noDispose,
        },
      };
    }

    let current;

    if (persist) {
      current = this.#documents.get(document);
    }

    if (current?.version === version) {
      return {
        result: 'success',
        value: castReflection(current, true),
      };
    }

    let directory = current?.directory;

    const outermostFolder = getOutermostFolder(uri);

    if (persist && outermostFolder) {
      directory ??= this.#folders.get(outermostFolder);
    }

    if (directory === undefined) {
      const temporaryDirectory = await createTemporaryDirectory(
        DocumentMirror.rootDirectory,
      );

      if (temporaryDirectory.result === 'error') {
        return temporaryDirectory;
      }

      directory = temporaryDirectory.value;
    }

    if (persist && outermostFolder && current?.directory === undefined) {
      this.#folders.set(outermostFolder, directory);
    }

    const file = await createFile(document, directory.cwd, autofix);

    if (file.result === 'error') {
      return file;
    }

    const disposableDirectory = { ...file.value, directory };

    if (persist) {
      this.#documents.set(document, {
        ...disposableDirectory,
        outermostFolder,
      });
    }

    measure.end();

    return {
      result: 'success',
      value: castReflection(disposableDirectory, persist),
    };
  }

  private async _removeFolders(
    folders: readonly WorkspaceFolder[] = this.#folders.keys().toArray(),
  ): Promise<void> {
    for (const folder of folders) {
      for (const [document, file] of this.#documents) {
        if (file.outermostFolder === undefined) {
          continue;
        }

        if (file.outermostFolder === folder) {
          this.#documents.delete(document);

          continue;
        }

        if (
          folder.uri.toString().startsWith(file.outermostFolder.uri.toString())
        ) {
          updateNestedDirectories(document, file);
        }
      }

      await using disposableDirectory = this.#folders.get(folder);

      if (disposableDirectory !== undefined) {
        this.#folders.delete(folder);
      }
    }
  }
}

/**
 * Uses the specified {@link temporaryDirectory} as the parent. If the
 * {@link document} has Workspace Folder, re-creates the document path relative
 * to its Workspace Folder.
 * Sets the actual {@link document} text as the file content. If the
 * {@link document} isn't untitled and {@link preventRename} is `false`, uses the
 * document file name for the created file.
 *
 * @param document - a document providing the text for the file
 * @param temporaryDirectory - an existing file system directory to contain the
 * file
 * @param preventRename - if `true`, `protolint` autofix for the filename is
 * suppressed via temporary disabling the rule `FILE_NAMES_LOWER_SNAKE_CASE`.
 */
async function createFile(
  document: TextDocument,
  temporaryDirectory: string,
  preventRename: boolean,
): Promise<TResult<IDocumentSnapshot, IReflectionError>> {
  const {
    isUntitled,
    uri,
    uri: { fsPath },
    version,
  } = document;

  const nestedDirectories = workspace.asRelativePath(
    Uri.joinPath(uri, '..'),
    false,
  );

  if (!path.isAbsolute(nestedDirectories)) {
    temporaryDirectory = path.resolve(temporaryDirectory, nestedDirectories);
    try {
      await mkdir(temporaryDirectory, { recursive: true });
    } catch (error) {
      return {
        error: {
          code: DocumentReflectionErrorCode.NestedDirectory,
          ...(isNodeError(error) && { error }),
        },
        result: 'error',
      };
    }
  }

  /**
   * This filename follows the guideline (lower_snake_case) so it won't be
   * flagged by `protolint`'s rule `FILE_NAMES_LOWER_SNAKE_CASE`.
   * However, when linting or autofixing, the original filename should be used.
   */
  const SAFE_BASENAME = 'file.proto';
  const fileUri = Uri.joinPath(
    Uri.file(temporaryDirectory),
    isUntitled ? SAFE_BASENAME : path.basename(fsPath),
  );

  const PREVENT_RENAME_PREFIX =
    '// protolint:disable FILE_NAMES_LOWER_SNAKE_CASE\n';
  let data = document.getText();

  if (preventRename) {
    data = PREVENT_RENAME_PREFIX + data;
  }

  try {
    await writeFile(fileUri.fsPath, data, { flag: 'w' });
  } catch (error) {
    return {
      error: {
        code: DocumentReflectionErrorCode.TemporaryFile,
        ...(isNodeError(error) && { error }),
      },
      result: 'error',
    };
  }

  const value: IDocumentSnapshot = {
    fileUri,
    nestedDirectories: '.',
    version,
  };
  const workspaceFolder = workspace.getWorkspaceFolder(uri);

  if (workspaceFolder) {
    const relative = workspace.asRelativePath(workspaceFolder.uri, false);

    if (!path.isAbsolute(relative)) {
      value.nestedDirectories = relative;
    }
  }

  return {
    result: 'success',
    value,
  };
}

/**
 * Creates a unique temporary sub-directory in {@link temporaryRoot} ready to
 * use with `using` statement.
 *
 * @param temporaryRoot - a file system directory to contain the temporary
 * directory
 */
async function createTemporaryDirectory(
  temporaryRoot: string,
): Promise<TResult<IDisposableDirectory, IReflectionError>> {
  try {
    await mkdir(temporaryRoot, { recursive: true });
  } catch (error) {
    return {
      error: {
        code: DocumentReflectionErrorCode.TemporaryRoot,
        ...(isNodeError(error) && { error }),
      },
      result: 'error',
    };
  }

  let cwd;

  try {
    cwd = await mkdtemp(temporaryRoot + path.sep);
  } catch (error) {
    return {
      error: {
        code: DocumentReflectionErrorCode.TemporaryDirectory,
        ...(isNodeError(error) && { error }),
      },
      result: 'error',
    };
  }

  return {
    result: 'success',
    value: {
      cwd,
      [Symbol.asyncDispose]: async function () {
        try {
          await rm(cwd, { maxRetries: 1, recursive: true });
        } catch (error) {
          logger.error(
            `[Document mirror] Failed removing the directory '${cwd}'`,
            error,
          );
        }
      },
    },
  };
}

function getOutermostFolder(uri: Uri) {
  return getOutermostFolders().find(
    ({ uri: folderUri }) =>
      workspace
        .getWorkspaceFolder(uri)
        ?.uri.toString()
        .startsWith(folderUri.toString()) ?? false,
  );
}

/**
 * @returns only outermost Workspace Folders.
 */
function getOutermostFolders(): WorkspaceFolder[] {
  return (
    workspace.workspaceFolders
      ?.toSorted(
        ({ uri: a }, { uri: b }) => b.toString().length - a.toString().length,
      )
      .filter(
        ({ uri: inner }, index, array) =>
          !array
            .slice(index + 1)
            .some(({ uri: outer }) =>
              inner.toString().startsWith(outer.toString()),
            ),
      ) ?? []
  );
}

const noDispose = function (): PromiseLike<void> {
  return Promise.resolve();
};

function castReflection(
  {
    directory: { cwd, [Symbol.asyncDispose]: dispose },
    fileUri,
    nestedDirectories,
  }: IDisposableSnapshot,
  skipDispose: boolean,
): IReflection {
  cwd = path.join(cwd, nestedDirectories);

  if (skipDispose) {
    dispose = noDispose;
  }

  return { cwd, fileUri, [Symbol.asyncDispose]: dispose };
}

function updateNestedDirectories(
  { uri }: TextDocument,
  file: IFolderAssociation,
) {
  const workspaceFolder = workspace.getWorkspaceFolder(uri);

  if (workspaceFolder === undefined) {
    logger.warn(
      `[DocumentMirror] The document '${uri.toString()}' has no Workspace Folder contrary to expectations. Setting nested directories to '.'`,
    );

    file.nestedDirectories = '.';

    return;
  }

  const nestedDirectories = workspace.asRelativePath(
    workspaceFolder.uri,
    false,
  );

  if (path.isAbsolute(nestedDirectories)) {
    file.nestedDirectories = '.';

    return;
  }

  file.nestedDirectories = nestedDirectories;
}

export type { IReflection, IReflectionError };
export { DocumentMirror };
