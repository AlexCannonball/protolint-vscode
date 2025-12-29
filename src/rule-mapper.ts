import {
  CodeAction,
  CodeActionKind,
  Diagnostic,
  DiagnosticSeverity,
  Range,
  Uri,
  WorkspaceEdit,
} from 'vscode';

import {
  DIAGNOSTIC_SOURCE,
  EDITOR_COMMAND_FIX_INDENTS,
  PROTOLINT_RULES_URI,
} from './constants.js';
import { TokenKind, TokenMap } from './protobuf-parser.js';

import type { TextDocument } from 'vscode';

import type { TResult } from './constants.js';
import type { IJsonLintsItem } from './json-report-parser.js';
import type { LookupErrorCode } from './protobuf-parser.js';

const RANGE_KEY = 'wrong';
const FIX_KEY = 'fix';

enum CodeActionErrorCode {
  ParsedMessage = 'UNEXPECTED_PARSED_MESSAGE',
}

enum ParseRangeErrorCode {
  ItemLine = 'UNREACHABLE_ITEM_LINE',
  SearchTextRequired = 'SEARCH_TEXT_REQUIRED',
  TokenKindRequired = 'TOKEN_KIND_REQUIRED',
}

interface ICodeActionError {
  code: CodeActionErrorCode;
  item: IJsonLintsItem;
}

interface IDiagnosticBase {
  parsedMessage: TParsedMessage;
  range: Range;
}

interface IMapper {
  codeActions?: TCodeActionsBuilder;
  diagnosticBase?: TDiagnosticRangeParser;
  pattern?: RegExp;
  tokenKind?: TokenKind;
}

interface IParseRangeError {
  code: LookupErrorCode | ParseRangeErrorCode;
  item: IJsonLintsItem;
}

interface IRangeParserOptions {
  searchText?: string;
  tokenKind?: TokenKind;
}

type TCodeActionsBuilder = (
  document: TextDocument,
  diagnostic: ProtolintDiagnostic,
) => TResult<CodeAction[], ICodeActionError>;

type TDiagnosticRangeParser = (
  document: TextDocument,
  item: IJsonLintsItem,
  options: IRangeParserOptions,
) => TResult<Range, IParseRangeError>;

type TParsedMessage = Record<string, string>;

/**
 * `protolint` diagnostic for VS Code.
 */
class ProtolintDiagnostic extends Diagnostic {
  public readonly error: IJsonLintsItem;

  public readonly parsedMessage: TParsedMessage;

  constructor(document: TextDocument, error: IJsonLintsItem) {
    const { parsedMessage, range } = diagnosticBase(document, error);

    super(range, error.message, DiagnosticSeverity.Warning);

    this.source = DIAGNOSTIC_SOURCE;
    this.code = {
      target: Uri.parse(PROTOLINT_RULES_URI),
      value: error.rule,
    };
    this.error = error;
    this.parsedMessage = parsedMessage;
  }
}

function defaultRange(document: TextDocument, { line }: IJsonLintsItem): Range {
  try {
    return document.lineAt(line - 1).range;
  } catch {
    return document.lineAt(0).range;
  }
}

const tokenRange: TDiagnosticRangeParser = function (
  document,
  item,
  { searchText, tokenKind },
) {
  if (tokenKind === undefined) {
    return {
      error: { code: ParseRangeErrorCode.TokenKindRequired, item },
      result: 'error',
    };
  }

  const tokenMap = new TokenMap(document);
  const result = tokenMap.parseFragment(
    tokenKind,
    item.line - 1,
    item.column - 1,
    searchText,
  );

  if (result.result === 'success') {
    return result;
  }

  return {
    error: { code: result.error.code, item },
    result: 'error',
  };
};

const indent: TDiagnosticRangeParser = function (document, item) {
  const { column, line } = item;

  try {
    const { lineNumber, text } = document.lineAt(line - 1);
    let startCharacter = column - 1;

    for (let index = column - 2; index >= 0; index--) {
      if (!/\s/.test(text.charAt(index))) {
        break;
      }

      startCharacter = index;
    }

    return {
      result: 'success',
      value: new Range(lineNumber, startCharacter, lineNumber, column - 1),
    };
  } catch {
    return {
      error: { code: ParseRangeErrorCode.ItemLine, item },
      result: 'error',
    };
  }
};

const indentActions: TCodeActionsBuilder = function ({ uri }, diagnostic) {
  const value: CodeAction[] = [];

  const fixAll = new CodeAction('Fix all indents', CodeActionKind.QuickFix);

  fixAll.isPreferred = true;
  fixAll.diagnostics = [diagnostic];
  fixAll.command = {
    command: EDITOR_COMMAND_FIX_INDENTS,
    title: 'Fix all indents',
    tooltip: 'Sets the editor indent to 2 spaces and reindents the document.',
  };

  value.push(fixAll);

  const { parsedMessage, range } = diagnostic;

  if (FIX_KEY in parsedMessage && !range.start.isEqual(range.end)) {
    const fixCurrent = new CodeAction(`Fix indent`, CodeActionKind.QuickFix);

    fixCurrent.edit = new WorkspaceEdit();
    fixCurrent.edit.replace(uri, range, parsedMessage[FIX_KEY]);
    fixCurrent.diagnostics = [diagnostic];

    value.push(fixCurrent);
  }

  return { result: 'success', value };
};

const lineLength: TDiagnosticRangeParser = function (
  document,
  item,
  { searchText },
) {
  if (searchText === undefined) {
    return {
      error: {
        code: ParseRangeErrorCode.SearchTextRequired,
        item,
      },
      result: 'error',
    };
  }

  const line = item.line - 1;

  try {
    const value = new Range(
      line,
      Number.parseInt(searchText),
      line,
      document.lineAt(line).text.length,
    );

    return { result: 'success', value };
  } catch {
    return {
      error: { code: ParseRangeErrorCode.ItemLine, item },
      result: 'error',
    };
  }
};

const enumFieldPrefixActions: TCodeActionsBuilder = function (
  { uri },
  diagnostic,
) {
  const { error, parsedMessage, range } = diagnostic;

  if (parsedMessage[FIX_KEY] !== undefined) {
    const prefix = parsedMessage[FIX_KEY] + '_';
    const action = new CodeAction(
      `Add prefix '${prefix}'`,
      CodeActionKind.QuickFix,
    );

    action.isPreferred = true;
    action.edit = new WorkspaceEdit();
    action.edit.insert(uri, range.start, prefix);
    action.diagnostics = [diagnostic];

    return { result: 'success', value: [action] };
  }

  return {
    error: { code: CodeActionErrorCode.ParsedMessage, item: error },
    result: 'error',
  };
};

const tokenNameActions: TCodeActionsBuilder = function ({ uri }, diagnostic) {
  const { error, parsedMessage, range } = diagnostic;

  if (parsedMessage[FIX_KEY] !== undefined) {
    const action = new CodeAction(
      `Set to '${parsedMessage[FIX_KEY]}'`,
      CodeActionKind.QuickFix,
    );

    action.isPreferred = true;
    action.edit = new WorkspaceEdit();
    action.edit.replace(uri, range, parsedMessage[FIX_KEY]);
    action.diagnostics = [diagnostic];

    return { result: 'success', value: [action] };
  }

  return {
    error: { code: CodeActionErrorCode.ParsedMessage, item: error },
    result: 'error',
  };
};

const enumZeroActions: TCodeActionsBuilder = function ({ uri }, diagnostic) {
  const {
    error,
    parsedMessage,
    range: { end },
  } = diagnostic;

  if (parsedMessage[FIX_KEY] !== undefined) {
    const suffix = '_' + parsedMessage[FIX_KEY];
    const action = new CodeAction(
      `Add suffix '${suffix}'`,
      CodeActionKind.QuickFix,
    );

    action.isPreferred = true;
    action.edit = new WorkspaceEdit();
    action.edit.insert(uri, end, suffix);
    action.diagnostics = [diagnostic];

    return { result: 'success', value: [action] };
  }

  return {
    error: { code: CodeActionErrorCode.ParsedMessage, item: error },
    result: 'error',
  };
};

const fileNameActions: TCodeActionsBuilder = function ({ uri }, diagnostic) {
  const { error, parsedMessage } = diagnostic;

  if (parsedMessage[FIX_KEY] !== undefined) {
    const action = new CodeAction(
      `Rename the file to '${parsedMessage[FIX_KEY]}'`,
      CodeActionKind.QuickFix,
    );

    action.isPreferred = true;
    action.edit = new WorkspaceEdit();

    const fixedUri: Uri = Uri.joinPath(uri, '..', parsedMessage[FIX_KEY]);

    action.edit.renameFile(uri, fixedUri, { overwrite: false });
    action.diagnostics = [diagnostic];

    return { result: 'success', value: [action] };
  }

  return {
    error: { code: CodeActionErrorCode.ParsedMessage, item: error },
    result: 'error',
  };
};

const requiredActions: TCodeActionsBuilder = function ({ uri }, diagnostic) {
  const { range } = diagnostic;
  const action = new CodeAction(`Remove 'required'`, CodeActionKind.QuickFix);

  action.isPreferred = true;
  action.edit = new WorkspaceEdit();
  action.edit.delete(uri, range);
  action.diagnostics = [diagnostic];

  return { result: 'success', value: [action] };
};

const serviceSuffixActions: TCodeActionsBuilder = function (
  { uri },
  diagnostic,
) {
  const {
    error,
    parsedMessage,
    range: { end },
  } = diagnostic;
  const suffix = parsedMessage[FIX_KEY];

  if (suffix !== undefined) {
    const action = new CodeAction(
      `Add suffix '${suffix}'`,
      CodeActionKind.QuickFix,
    );

    action.isPreferred = true;
    action.edit = new WorkspaceEdit();
    action.edit.insert(uri, end, suffix);
    action.diagnostics = [diagnostic];

    return { result: 'success', value: [action] };
  }

  return {
    error: { code: CodeActionErrorCode.ParsedMessage, item: error },
    result: 'error',
  };
};

const RULE_MAP: ReadonlyMap<string, IMapper> = new Map<string, IMapper>([
  [
    'ENUM_FIELD_NAMES_PREFIX',
    {
      codeActions: enumFieldPrefixActions,
      diagnosticBase: tokenRange,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/enumFieldNamesPrefixRule.go#L81 */
      pattern: new RegExp(
        `^EnumField name "(?<${RANGE_KEY}>.+)" should have the prefix "(?<${FIX_KEY}>.+)"$`,
      ),
      tokenKind: TokenKind.EnumValueName,
    },
  ],
  [
    'ENUM_FIELD_NAMES_UPPER_SNAKE_CASE',
    {
      codeActions: tokenNameActions,
      diagnosticBase: tokenRange,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/enumFieldNamesUpperSnakeCaseRule.go#L71 */
      pattern: new RegExp(
        `^EnumField name "(?<${RANGE_KEY}>.+)" must be CAPITALS_WITH_UNDERSCORES like "(?<${FIX_KEY}>.+)"$`,
      ),
      tokenKind: TokenKind.EnumValueName,
    },
  ],
  [
    'ENUM_FIELD_NAMES_ZERO_VALUE_END_WITH',
    {
      codeActions: enumZeroActions,
      diagnosticBase: tokenRange,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/enumFieldNamesZeroValueEndWithRule.go#L84 */
      pattern: new RegExp(
        `^EnumField name "(?<${RANGE_KEY}>.+)" with zero value should have the suffix "(?<${FIX_KEY}>.+)"$`,
      ),
      tokenKind: TokenKind.EnumValueName,
    },
  ],
  [
    'ENUM_NAMES_UPPER_CAMEL_CASE',
    {
      codeActions: tokenNameActions,
      diagnosticBase: tokenRange,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/enumNamesUpperCamelCaseRule.go#L72 */
      pattern: new RegExp(
        `^Enum name "(?<${RANGE_KEY}>.+)" must be UpperCamelCase like "(?<${FIX_KEY}>.+)"$`,
      ),
      tokenKind: TokenKind.EnumName,
    },
  ],
  [
    'FIELD_NAMES_EXCLUDE_PREPOSITIONS',
    {
      diagnosticBase: tokenRange,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/fieldNamesExcludePrepositionsRule.go#L136 */
      pattern: new RegExp(
        `^Field name "(?<${RANGE_KEY}>.+)" should not include a preposition "(?<${FIX_KEY}>.+)"$`,
      ),
      tokenKind: TokenKind.FieldName,
    },
  ],
  [
    'FIELD_NAMES_LOWER_SNAKE_CASE',
    {
      codeActions: tokenNameActions,
      diagnosticBase: tokenRange,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/fieldNamesLowerSnakeCaseRule.go#L73 */
      pattern: new RegExp(
        `^Field name "(?<${RANGE_KEY}>.+)" must be underscore_separated_names like "(?<${FIX_KEY}>.+)"$`,
      ),
      tokenKind: TokenKind.FieldName,
    },
  ],
  [
    'FILE_NAMES_LOWER_SNAKE_CASE',
    {
      codeActions: fileNameActions,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/fileNamesLowerSnakeCaseRule.go#L78 */
      pattern: new RegExp(
        `^File name ".+" should be lower_snake_case.proto like "(?<${FIX_KEY}>.+)".$`,
      ),
    },
  ],
  [
    'INDENT',
    {
      codeActions: indentActions,
      diagnosticBase: indent,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/indentRule.go#L330
       * At the moment ignoring the incorrect value due to the bug https://github.com/yoheimuta/protolint/issues/349
       */
      pattern: new RegExp(
        `^Found an incorrect indentation style ".*"\\. "(?<${FIX_KEY}>.*)" is correct\\.$`,
      ),
    },
  ],
  [
    'MAX_LINE_LENGTH',
    {
      diagnosticBase: lineLength,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/maxLineLengthRule.go#L106 */
      pattern: new RegExp(
        `^The line length is \\d+, but it must be shorter than (?<${RANGE_KEY}>\\d+)$`,
      ),
    },
  ],
  [
    'MESSAGE_NAMES_EXCLUDE_PREPOSITIONS',
    {
      diagnosticBase: tokenRange,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/messageNamesExcludePrepositionsRule.go#L79 */
      pattern: new RegExp(
        `^Message name "(?<${RANGE_KEY}>.+)" should not include a preposition "(?<${FIX_KEY}>.+)"$`,
      ),
      tokenKind: TokenKind.MessageName,
    },
  ],
  [
    'MESSAGE_NAMES_UPPER_CAMEL_CASE',
    {
      codeActions: tokenNameActions,
      diagnosticBase: tokenRange,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/messageNamesUpperCamelCaseRule.go#L72 */
      pattern: new RegExp(
        `^Message name "(?<${RANGE_KEY}>.+)" must be UpperCamelCase like "(?<${FIX_KEY}>.+)"$`,
      ),
      tokenKind: TokenKind.MessageName,
    },
  ],
  [
    'PACKAGE_NAME_LOWER_CASE',
    {
      codeActions: tokenNameActions,
      diagnosticBase: tokenRange,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/packageNameLowerCaseRule.go#L67 */
      pattern: new RegExp(
        `^Package name "(?<${RANGE_KEY}>.+)" must not contain any uppercase letter\\. Consider to change like "(?<${FIX_KEY}>.+)"\\.$`,
      ),
      tokenKind: TokenKind.PackageName,
    },
  ],
  [
    'PROTO3_FIELDS_AVOID_REQUIRED',
    {
      codeActions: requiredActions,
      diagnosticBase: tokenRange,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/proto3FieldsAvoidRequiredRule.go#L68 */
      tokenKind: TokenKind.Required,
    },
  ],
  [
    'QUOTE_CONSISTENT',
    {
      codeActions: tokenNameActions,
      diagnosticBase: tokenRange,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/quoteConsistentRule.go#L68 */
      pattern: new RegExp(
        `^Quoted string should be (?<${FIX_KEY}>.+) but was (?<${RANGE_KEY}>.+)\\.$`,
      ),
      tokenKind: TokenKind.FieldName,
    },
  ],
  [
    'REPEATED_FIELD_NAMES_PLURALIZED',
    {
      codeActions: tokenNameActions,
      diagnosticBase: tokenRange,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/repeatedFieldNamesPluralizedRule.go#L102 */
      pattern: new RegExp(
        `^Repeated field name "(?<${RANGE_KEY}>.+)" must be pluralized name "(?<${FIX_KEY}>.+)"$`,
      ),
      tokenKind: TokenKind.FieldName,
    },
  ],
  [
    'RPC_NAMES_CASE',
    {
      diagnosticBase: tokenRange,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/rpcNamesCaseRule.go#L58-L62 */
      pattern: new RegExp(`^RPC name "(?<${RANGE_KEY}>.+)" must be .+$`),
      tokenKind: TokenKind.RpcName,
    },
  ],
  [
    'RPC_NAMES_UPPER_CAMEL_CASE',
    {
      codeActions: tokenNameActions,
      diagnosticBase: tokenRange,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/rpcNamesUpperCamelCaseRule.go#L72 */
      pattern: new RegExp(
        `^RPC name "(?<${RANGE_KEY}>.+)" must be UpperCamelCase like "(?<${FIX_KEY}>.+)"$`,
      ),
      tokenKind: TokenKind.RpcName,
    },
  ],
  [
    'SERVICE_NAMES_END_WITH',
    {
      codeActions: serviceSuffixActions,
      diagnosticBase: tokenRange,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/serviceNamesEndWithRule.go#L57 */
      pattern: new RegExp(
        `^Service name "(?<${RANGE_KEY}>.+)" must end with (?<${FIX_KEY}>.+)$`,
      ),
      tokenKind: TokenKind.ServiceName,
    },
  ],
  [
    'SERVICE_NAMES_UPPER_CAMEL_CASE',
    {
      codeActions: tokenNameActions,
      diagnosticBase: tokenRange,
      /** @see https://github.com/yoheimuta/protolint/blob/v0.43.2/internal/addon/rules/serviceNamesUpperCamelCaseRule.go#L72 */
      pattern: new RegExp(
        `^Service name "(?<${RANGE_KEY}>.+)" must be UpperCamelCase like "(?<${FIX_KEY}>.+)"$`,
      ),
      tokenKind: TokenKind.ServiceName,
    },
  ],
]);

/**
 * @param document The target document
 * @param diagnostic The diagnostic to get the code actions
 * @returns Code actions array for the specified diagnostic
 */
function codeActions(
  document: TextDocument,
  diagnostic: ProtolintDiagnostic,
): CodeAction[] {
  const result = RULE_MAP.get(diagnostic.error.rule)?.codeActions?.(
    document,
    diagnostic,
  );

  if (result?.result === 'success') {
    return result.value;
  }

  return [];
}

function diagnosticBase(
  document: TextDocument,
  item: IJsonLintsItem,
): IDiagnosticBase {
  const { message, rule } = item;
  const mapper = RULE_MAP.get(rule);
  const parsedMessage: IDiagnosticBase['parsedMessage'] =
    mapper?.pattern?.exec(message)?.groups ?? {};
  let range: IDiagnosticBase['range'] | undefined;

  if (mapper?.diagnosticBase !== undefined) {
    const result = mapper.diagnosticBase(document, item, {
      ...mapper,
      searchText: parsedMessage[RANGE_KEY],
    });

    if (result.result === 'success') {
      range = result.value;
    }
  }

  range ??= defaultRange(document, item);

  return { parsedMessage, range };
}

/**
 * For testing purposes only. Please don't use it for the extension logic.
 */
const testing = {
  defaultRange,
  diagnosticBase,
  FIX_KEY,
  RANGE_KEY,
};

export type { TParsedMessage };
export { codeActions, ProtolintDiagnostic, testing };
