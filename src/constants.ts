import package_ from '../package.json' with { type: 'json' };

import type { DocumentSelector, TextDocument } from 'vscode';

import type { Diagnostics } from './diagnostics.js';
import type { Executable } from './executable.js';

const { contributes, name, publisher } = package_;

/**
 * This VS Code Extension full identifier in the form of `publisher.name`.
 */
const EXTENSION_ID = `${publisher}.${name}`;

const SUPPORTED_LANGUAGE_ID = 'proto3';
const SUPPORTED_LANGUAGE_IDS = [SUPPORTED_LANGUAGE_ID];

/**
 * The extension context key for specifying supported language IDs.
 */
const SUPPORTED_LANGUAGE_IDS_CONTEXT_KEY = 'protolint.supportedLanguageIds';

/**
 * The extension section in VS Code config.
 */
const CONFIG_SECTION = 'protolint';

/**
 * The command identifier for reindenting a document text.
 */
const EDITOR_COMMAND_FIX_INDENTS = 'protolint.editorFixIndents';
const {
  commands: [
    { command: EDITOR_COMMAND_LINT },
    { command: EDITOR_COMMAND_AUTOFIX },
  ],
} = contributes;

const PROTOLINT_REPO_URI =
  'https://github.com/yoheimuta/protolint#installation';

/**
 * `protolint` rules documentation section.
 */
const PROTOLINT_RULES_URI =
  'https://github.com/yoheimuta/protolint/blob/master/README.md#rules';

/**
 * This works when the linter executable is available via PATH Environment
 * Variable.
 */
const FAILOVER_PROTOLINT_COMMAND = 'protolint';

/**
 * The collection name for keeping `protolint` diagnostics.
 */
const DIAGNOSTICS_COLLECTION_NAME = 'protolint';

/**
 * `protolint` config file basename.
 */
const CONFIG_BASENAME = '.protolint.yaml';

/**
 * Document filter to select protocol buffer documents.
 */
const PROTOBUF_SELECTOR: DocumentSelector = [
  { language: SUPPORTED_LANGUAGE_ID, scheme: 'untitled' },
  { pattern: '**/*.proto', scheme: 'file' },
];

/**
 * The human-readable diagnostic source description for `protolint`.
 */
const DIAGNOSTIC_SOURCE = 'protolint';
/**
 * A code for this `protolint` diagnostic in case of the linter runtime error.
 */
const RUNTIME_ERROR_CODE = 'RUNTIME_ERR';

/**
 * A wrapper for an operation result.
 */
type TResult<T, E> =
  | { error: E; result: 'error' }
  | { result: 'success'; value: T };

/**
 * The command identifier for fixing `protolint` executable.
 */
const COMMAND_FIX_EXECUTABLE_COMMAND = 'protolint.fixExecutableCommand';
/**
 * The command identifier for linting multiple documents vai `protolint`.
 */
const COMMAND_LINT_DOCUMENTS = 'protolint.lintDocuments';

/**
 * The extension commands.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type TExtensionCommands = {
  [COMMAND_FIX_EXECUTABLE_COMMAND]: (executable: Executable) => void;
  [COMMAND_LINT_DOCUMENTS]: (
    documents: TextDocument[],
  ) => Promise<
    PromiseSettledResult<Awaited<ReturnType<Diagnostics['refresh']>>>[]
  >;
};

/**
 * `-auto_disable` option values in `protolint`.
 *
 * {@link https://github.com/yoheimuta/protolint?tab=readme-ov-file#rules}
 */
const AUTO_DISABLE_MODES = ['next', 'none', 'this'] as const;

/**
 * `-auto_disable` option values in `protolint`.
 *
 * {@link https://github.com/yoheimuta/protolint?tab=readme-ov-file#rules}
 */
type TAutoDisableMode = (typeof AUTO_DISABLE_MODES)[number];

export type { TAutoDisableMode, TExtensionCommands, TResult };
export {
  AUTO_DISABLE_MODES,
  COMMAND_FIX_EXECUTABLE_COMMAND,
  COMMAND_LINT_DOCUMENTS,
  CONFIG_BASENAME,
  CONFIG_SECTION,
  DIAGNOSTIC_SOURCE,
  DIAGNOSTICS_COLLECTION_NAME,
  EDITOR_COMMAND_AUTOFIX,
  EDITOR_COMMAND_FIX_INDENTS,
  EDITOR_COMMAND_LINT,
  EXTENSION_ID,
  FAILOVER_PROTOLINT_COMMAND,
  PROTOBUF_SELECTOR,
  PROTOLINT_REPO_URI,
  PROTOLINT_RULES_URI,
  RUNTIME_ERROR_CODE,
  SUPPORTED_LANGUAGE_ID,
  SUPPORTED_LANGUAGE_IDS,
  SUPPORTED_LANGUAGE_IDS_CONTEXT_KEY,
};
