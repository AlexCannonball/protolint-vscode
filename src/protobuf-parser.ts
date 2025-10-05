import { Range } from 'vscode';

import type { TextDocument, TextLine } from 'vscode';

import type { TResult } from './constants.js';

const COMMENT_OPEN = String.raw`\/\/|\/\*`;
const COMMENT_CLOSE = String.raw`\*\/`;
const IDENTIFIER = String.raw`[a-zA-Z_]\w*`;
const QUALIFIED_IDENTIFIER = `${IDENTIFIER}(?:\\.${IDENTIFIER})*`;
const FIELD_TYPE = `\\.?${IDENTIFIER}(?:\\.${IDENTIFIER})*`;
const REQUIRED = 'required';
const FIELD_CARDINALITY = `${REQUIRED}|optional|repeated`;
const FIELD_DECLARATION_EXCEPTIONS = `^group|message|enum|oneof|reserved|extensions|extend|option|${FIELD_CARDINALITY}`;
const MESSAGE = 'message';
const ENUM = 'enum';
const ENUM_VALUE_NAME_EXCEPTIONS = '^(?:option|reserved)';
const PACKAGE = 'package';
const RPC = 'rpc';
const SERVICE = 'service';

enum ExcludeLineRangesErrorCode {
  RangeBeyondLine = 'RANGE_BEYOND_LINE',
  RangeIntersection = 'RANGE_INTERSECTION',
}

enum LookupErrorCode {
  InvalidExcludeRanges = 'INVALID_EXCLUDE_RANGES',
  LineNumber = 'INVALID_LINE_NUMBER',
  NotFound = 'NOT_FOUND',
  NotImplemented = 'TOKEN_LOOKUP_NOT_IMPLEMENTED',
  UnexpectedCommentOpen = 'UNEXPECTED_COMMENT_OPEN_PATTERN',
  UnexpectedEnumValueName = 'UNEXPECTED_ENUM_VALUE_NAME',
  UnexpectedFieldType = 'UNEXPECTED_FIELD_TYPE',
  UnexpectedGroup = 'UNEXPECTED_GROUP_IN_FIELD',
}

/**
 * Protobuf language token kind.
 */
enum TokenKind {
  Comment = 'comment',
  Enum = 'enum',
  EnumName = 'enum_name',
  EnumValueName = 'enum_value_name',
  FieldCardinality = 'field_cardinality',
  FieldName = 'field_name',
  FieldType = 'field_type',
  Message = 'message',
  MessageName = 'message_name',
  Package = 'package',
  PackageName = 'package_name',
  Required = 'required',
  Rpc = 'rpc',
  RpcName = 'rpc_name',
  Service = 'service',
  ServiceName = 'service_name',
}

interface IExcludeLineRangesError {
  code: ExcludeLineRangesErrorCode;
}

interface ILineComments {
  closed: boolean;
  ranges: ITokenRange[];
}

interface ILookupError {
  code: LookupErrorCode;
}

interface IMatchRange {
  fullMatch: string;
  range: Range;
}

interface ITokenRange extends IMatchRange {
  closed: boolean;
}

type TLookupTask = (
  excludeRanges: ITokenRange[],
  searchText?: string,
) => TResult<TTokenMap, ILookupError>;

type TTokenMap = Map<TokenKind, ITokenRange[]>;

/**
 * Class for parsing protobuf language token positions in text documents.
 * Unfortunately protolint linting reports don't provide exact error positions,
 * so this class is used to locate a specific token instead of the whole line.
 *
 * The class performs specific fragment parsing line-by-line and doesn't return
 * abstract syntax trees. As soon as the token is located it stops parsing.
 */
class TokenMap {
  public get tokens(): ReadonlyMap<TokenKind, ITokenRange[]> {
    return this.#tokens as ReadonlyMap<TokenKind, ITokenRange[]>;
  }

  /**
   * A text document where protobuf language tokens are parsed.
   */
  readonly #doc: TextDocument;

  /**
   * Index to start searching from when parsing a next token in the current
   * text line.
   */
  #lastIndex = 0;

  /**
   * The current document line to search a token.
   */
  #line: TextLine;

  /**
   * All tokens discovered for the current fragment of the document.
   *
   * The order of ranges is arbitrary.
   */
  readonly #tokens: TTokenMap = new Map();

  /**
   * @param document A document with a text fragment to be parsed.
   */
  constructor(document: TextDocument) {
    this.#doc = document;
    this.#line = this.#doc.lineAt(0);
  }

  /**
   * Searches a token range line-by-line. If the token isn't found, stops after
   * the last document line.
   *
   * @param kind The type of token to be parsed.
   * @param lineNumber A zero-based document line number to start parsing from.
   * @param lastIndex A text line character index to start parsing from.
   * @param searchText A text to search. Provide for tokens with a variable text
   * like message field name.
   * @returns The range of the token in the specified text fragment.
   */
  public parseFragment(
    kind: TokenKind,
    lineNumber: number,
    lastIndex: number,
    searchText?: string,
  ): TResult<Range, ILookupError> {
    this.#lastIndex = lastIndex;

    const result = this._getTasks(kind);

    if (result.result === 'error') {
      return result;
    }

    const { value: tasks } = result;

    try {
      this.#line = this.#doc.lineAt(lineNumber);
    } catch {
      return {
        error: { code: LookupErrorCode.LineNumber },
        result: 'error',
      };
    }

    for (
      let commentClosed = true;
      lineNumber < this.#doc.lineCount;
      lineNumber++
    ) {
      this.#line = this.#doc.lineAt(lineNumber);

      const comments = this._parseCurrentLineComments(commentClosed);

      if (comments.result === 'error') {
        return comments;
      }

      commentClosed = comments.value.closed;

      const tasksRemained = [...tasks];

      for (const task of tasksRemained) {
        const taskRun = task(comments.value.ranges, searchText);

        if (taskRun.result === 'success') {
          tasks.shift();
          this.upsert(taskRun.value);
          continue;
        }

        if (taskRun.error.code === LookupErrorCode.NotFound) {
          break;
        }

        return taskRun;
      }

      const value = this.#tokens.get(kind)?.[0].range;

      if (value !== undefined) {
        return { result: 'success', value };
      }

      this.#lastIndex = 0;
    }

    return {
      error: {
        code: LookupErrorCode.NotFound,
      },
      result: 'error',
    };
  }

  /**
   * Appends {@link appendix} to the current token map.
   *
   * The map entry values are not deduplicated.
   * Keeps the order of the appended values.
   *
   * @param appendix A map of tokens to be appended.
   */
  protected upsert(appendix: TTokenMap): void {
    for (const [key, value] of appendix.entries()) {
      if (this.#tokens.has(key)) {
        this.#tokens.get(key)?.push(...value);
      } else {
        this.#tokens.set(key, value);
      }
    }
  }

  private _enum(excludeRanges: ITokenRange[]) {
    return this._token(TokenKind.Enum, excludeRanges, ENUM);
  }

  private _enumName(excludeRanges: ITokenRange[], searchText?: string) {
    return this._token(
      TokenKind.EnumName,
      excludeRanges,
      searchText ?? IDENTIFIER,
    );
  }

  private _enumValueName(
    excludeRanges: ITokenRange[],
    searchText?: string,
  ): TResult<TTokenMap, ILookupError> {
    const token = this._token(
      TokenKind.EnumValueName,
      excludeRanges,
      searchText ?? IDENTIFIER,
    );

    if (token.result === 'success') {
      const { fullMatch } = token.value.get(TokenKind.EnumValueName)?.[0] ?? {};

      if (
        fullMatch !== undefined &&
        new RegExp(ENUM_VALUE_NAME_EXCEPTIONS).test(fullMatch)
      ) {
        return {
          error: { code: LookupErrorCode.UnexpectedEnumValueName },
          result: 'error',
        };
      }
    }

    return token;
  }

  private _fieldName(
    excludeRanges: ITokenRange[],
    searchText?: string,
  ): TResult<TTokenMap, ILookupError> {
    return this._token(
      TokenKind.FieldName,
      excludeRanges,
      searchText ?? IDENTIFIER,
    );
  }

  private _fieldType(
    excludeRanges: ITokenRange[],
  ): TResult<TTokenMap, ILookupError> {
    let [cardinality = undefined] =
      this.tokens.get(TokenKind.FieldCardinality) ?? [];

    const searchRanges = excludeLineRanges(this.#line, excludeRanges);

    if (searchRanges.result === 'error') {
      return {
        error: { code: LookupErrorCode.InvalidExcludeRanges },
        result: 'error',
      };
    }

    for (const range of searchRanges.value) {
      const matches = matchRanges(
        this.#line,
        range,
        FIELD_TYPE,
        this.#lastIndex,
        cardinality ? 1 : 2,
      );
      const [firstMatch = undefined, secondMatch = undefined] = matches;

      let fieldType = firstMatch;

      if (!firstMatch) {
        continue;
      }

      if (
        !cardinality &&
        new RegExp(FIELD_CARDINALITY).test(this.#doc.getText(firstMatch.range))
      ) {
        cardinality = { ...firstMatch, closed: true };
        this.upsert(new Map([[TokenKind.FieldCardinality, [cardinality]]]));
        this.#lastIndex = firstMatch.range.end.character;

        fieldType = secondMatch;
      }

      if (!fieldType) {
        continue;
      }

      const validation = this._validateFieldType(fieldType, cardinality);

      if (validation.result === 'error') {
        return validation;
      }

      const type = { ...fieldType, closed: true };

      this.#lastIndex = fieldType.range.end.character;

      return {
        result: 'success',
        value: new Map([[TokenKind.FieldType, [type]]]),
      };
    }

    return {
      error: { code: LookupErrorCode.NotFound },
      result: 'error',
    };
  }

  /**
   * Provides the lookup tasks array.
   * Complete these tasks one-by-one to find the token.
   *
   * @param kind A token type to parse.
   * @returns The lookup task sequence.
   */
  private _getTasks(kind: TokenKind): TResult<TLookupTask[], ILookupError> {
    let value: TLookupTask[] = [];

    switch (kind) {
      case TokenKind.Comment:
      case TokenKind.Enum:
      case TokenKind.FieldCardinality:
      case TokenKind.FieldType:
      case TokenKind.Message:
      case TokenKind.Package:
      case TokenKind.Rpc:
      case TokenKind.Service:
        return {
          error: { code: LookupErrorCode.NotImplemented },
          result: 'error',
        };

      case TokenKind.EnumName:
        value = [this._enum.bind(this), this._enumName.bind(this)];
        break;

      case TokenKind.EnumValueName:
        value = [this._enumValueName.bind(this)];
        break;

      case TokenKind.FieldName:
        value = [this._fieldType.bind(this), this._fieldName.bind(this)];
        break;

      case TokenKind.MessageName:
        value = [this._message.bind(this), this._messageName.bind(this)];
        break;

      case TokenKind.PackageName:
        value = [this._package.bind(this), this._packageName.bind(this)];
        break;

      case TokenKind.Required:
        value = [this._required.bind(this)];
        break;

      case TokenKind.RpcName:
        value = [this._rpc.bind(this), this._rpcName.bind(this)];
        break;

      case TokenKind.ServiceName:
        value = [this._service.bind(this), this._serviceName.bind(this)];
        break;
    }

    return {
      result: 'success',
      value,
    };
  }

  /**
   * Returns {@link TTokenMap} with all {@link TokenKind.Comment} ranges for the
   * current document line. If a multi-line comment isn't closed at this line,
   * the respective {@link ITokenRange.closed} is set to `false`.
   *
   * The method doesn't add tokens to {@link TokenMap.tokens}
   *
   * @param commentClosed Set to `false` if a multi-line comment isn't closed at
   * the previous line.
   */
  private _lineComments(
    commentClosed = true,
  ): TResult<TTokenMap, ILookupError> {
    const { range: lineRange, text } = this.#line;
    const openPattern = new RegExp(COMMENT_OPEN, 'g');
    const closePattern = new RegExp(COMMENT_CLOSE, 'g');

    const ranges: ITokenRange[] = [];

    let lastIndex = this.#lastIndex;

    let pattern;
    let match;
    let commentOpenIndex = 0;

    do {
      pattern = commentClosed ? openPattern : closePattern;
      pattern.lastIndex = lastIndex;
      match = pattern.exec(text);

      if (match === null) {
        if (!commentClosed) {
          const range = lineRange.with({
            start: lineRange.start.with({ character: commentOpenIndex }),
          });

          ranges.push({
            closed: false,
            fullMatch: this.#doc.getText(range),
            range,
          });
        }

        continue;
      }

      if (!commentClosed) {
        commentClosed = true;
        ({ lastIndex } = pattern);

        const range = lineRange.with({
          end: lineRange.end.with({ character: pattern.lastIndex }),
          start: lineRange.start.with({ character: commentOpenIndex }),
        });

        ranges.push({
          closed: true,
          fullMatch: this.#doc.getText(range),
          range,
        });

        continue;
      }

      if (match[0] === '//') {
        const range = lineRange.with({
          start: lineRange.start.with({ character: match.index }),
        });

        ranges.push({
          closed: true,
          fullMatch: this.#doc.getText(range),
          range,
        });

        break;
      }

      if (match[0] === '/*') {
        commentClosed = false;
        ({ lastIndex } = pattern);
        commentOpenIndex = match.index;

        continue;
      }

      return {
        error: {
          code: LookupErrorCode.UnexpectedCommentOpen,
        },
        result: 'error',
      };
    } while (match !== null);

    return {
      result: 'success',
      value: new Map([[TokenKind.Comment, ranges]]),
    };
  }

  private _message(
    excludeRanges: ITokenRange[],
  ): TResult<TTokenMap, ILookupError> {
    return this._token(TokenKind.Message, excludeRanges, MESSAGE);
  }

  private _messageName(
    excludeRanges: ITokenRange[],
    searchText?: string,
  ): TResult<TTokenMap, ILookupError> {
    return this._token(
      TokenKind.MessageName,
      excludeRanges,
      searchText ?? IDENTIFIER,
    );
  }

  private _package(
    excludeRanges: ITokenRange[],
  ): TResult<TTokenMap, ILookupError> {
    return this._token(TokenKind.Package, excludeRanges, PACKAGE);
  }

  private _packageName(
    excludeRanges: ITokenRange[],
    searchText?: string,
  ): TResult<TTokenMap, ILookupError> {
    return this._token(
      TokenKind.PackageName,
      excludeRanges,
      searchText ?? QUALIFIED_IDENTIFIER,
    );
  }

  /**
   * Performs a parsing comments task in the current line and saving the
   * result to {@link TokenMap.tokens}.
   *
   * @param commentClosed Set to `false` if a multi-line comment isn't closed at
   * the previous line.
   */
  private _parseCurrentLineComments(
    commentClosed: boolean,
  ): TResult<ILineComments, ILookupError> {
    const lineComments = this._lineComments(commentClosed);

    if (lineComments.result === 'error') {
      return lineComments;
    }
    this.upsert(lineComments.value);
    const comments = lineComments.value.get(TokenKind.Comment) ?? [];

    commentClosed = comments.at(-1)?.closed ?? commentClosed;

    return {
      result: 'success',
      value: { closed: commentClosed, ranges: comments },
    };
  }

  private _required(
    excludeRanges: ITokenRange[],
  ): TResult<TTokenMap, ILookupError> {
    return this._token(TokenKind.Required, excludeRanges, REQUIRED);
  }

  private _rpc(excludeRanges: ITokenRange[]): TResult<TTokenMap, ILookupError> {
    return this._token(TokenKind.Rpc, excludeRanges, RPC);
  }

  private _rpcName(
    excludeRanges: ITokenRange[],
    searchText?: string,
  ): TResult<TTokenMap, ILookupError> {
    return this._token(
      TokenKind.RpcName,
      excludeRanges,
      searchText ?? IDENTIFIER,
    );
  }

  private _service(
    excludeRanges: ITokenRange[],
  ): TResult<TTokenMap, ILookupError> {
    return this._token(TokenKind.Service, excludeRanges, SERVICE);
  }

  private _serviceName(
    excludeRanges: ITokenRange[],
    searchText?: string,
  ): TResult<TTokenMap, ILookupError> {
    return this._token(
      TokenKind.ServiceName,
      excludeRanges,
      searchText ?? IDENTIFIER,
    );
  }

  /**
   * Returns a range of the specified token.
   * The method doesn't update {@link TokenMap.tokens}. However `#lastIndex` is
   * advanced as any next token is expected after this one.
   *
   * @param kind A token type to parse.
   * @param excludeRanges Ranges to exclude from parsing.
   * @param searchText A text pattern to search.
   * @returns
   */
  private _token(
    kind: TokenKind,
    excludeRanges: ITokenRange[],
    searchText: string,
  ): TResult<TTokenMap, ILookupError> {
    const ranges: ITokenRange[] = [];
    const value: TTokenMap = new Map([[kind, ranges]]);

    const searchRanges = excludeLineRanges(this.#line, excludeRanges);

    if (searchRanges.result === 'error') {
      return {
        error: { code: LookupErrorCode.InvalidExcludeRanges },
        result: 'error',
      };
    }

    for (const range of searchRanges.value) {
      const matches = matchRanges(
        this.#line,
        range,
        searchText,
        this.#lastIndex,
        1,
      );

      if (matches.length > 0) {
        const [match] = matches;

        ranges.push({ ...match, closed: true });
        this.#lastIndex = match.range.end.character;

        return {
          result: 'success',
          value,
        };
      }
    }

    return {
      error: { code: LookupErrorCode.NotFound },
      result: 'error',
    };
  }

  /**
   * Validates a range pretending to be a protobuf field type declaration.
   * Returns error if it's invalid.
   *
   * Must be performed after figuring out this field's {@link cardinality}.
   * @param fieldType A range pretending to be a protobuf field type
   * declaration.
   * @param cardinality Set if this protobuf field has cardinality.
   * type.
   */
  private _validateFieldType(
    fieldType: IMatchRange,
    cardinality: ITokenRange | undefined,
  ): TResult<undefined, ILookupError> {
    const token = this.#doc.getText(fieldType.range);

    if (cardinality && token === 'group') {
      return {
        error: { code: LookupErrorCode.UnexpectedGroup },
        result: 'error',
      };
    }

    if (!cardinality && new RegExp(FIELD_DECLARATION_EXCEPTIONS).test(token)) {
      return {
        error: { code: LookupErrorCode.UnexpectedFieldType },
        result: 'error',
      };
    }

    return {
      result: 'success',
      value: undefined,
    };
  }
}

/**
 * Returns an array of ranges that represents a {@link TextLine} with excluded
 * {@link excludedRanges}.
 *
 * Use it to exclude particular text fragments (e.g. comments)
 * when finding a token in {@link line}.
 *
 * @param excludedRanges An array of ranges to be excluded. All ranges must belong to
 * {@link line}. The ranges must not overlap.
 */
function excludeLineRanges(
  { lineNumber, range: lineRange }: TextLine,
  excludedRanges: ITokenRange[],
): TResult<Range[], IExcludeLineRangesError> {
  if (!excludedRanges.every(({ range }) => lineRange.contains(range))) {
    return {
      error: { code: ExcludeLineRangesErrorCode.RangeBeyondLine },
      result: 'error',
    };
  }

  excludedRanges.sort(
    (a, b) => a.range.start.character - b.range.start.character,
  );

  const edges: number[] = [];

  edges.unshift(lineRange.start.character);
  for (const { range } of excludedRanges) {
    edges.push(range.start.character, range.end.character);
  }
  edges.push(lineRange.end.character);

  const value: Range[] = [];

  for (let index = 0; index < edges.length; index += 2) {
    if (edges[index] > edges[index + 1]) {
      return {
        error: { code: ExcludeLineRangesErrorCode.RangeIntersection },
        result: 'error',
      };
    }

    if (edges[index] !== edges[index + 1]) {
      value.push(
        new Range(lineNumber, edges[index], lineNumber, edges[index + 1]),
      );
    }
  }

  return {
    result: 'success',
    value,
  };
}

/**
 * Returns ranges found for {@link pattern} in the specified {@link line}.
 *
 * @param line A document text line for seeking {@link pattern}.
 * @param seekRange The {@link line}'s range for searching.
 * @param pattern A string with {@link RegExp} for searching.
 * Literal {@link RegExp} notation like `/ab+c/` isn't accepted.
 * @param lastIndex The {@link line} character index to start searching from.
 * Is combined with {@link seekRange} requirements.
 * @param limit The {@link pattern} matches limit. The function may return less
 * than {@link limit} matches.
 */
function matchRanges(
  line: TextLine,
  seekRange: Range,
  pattern: string,
  lastIndex = 0,
  limit = 0,
): IMatchRange[] {
  const regexp = new RegExp(pattern, 'g');

  regexp.lastIndex = Math.max(seekRange.start.character, lastIndex);
  limit = limit < 0 ? 0 : Math.floor(limit);

  const matches: IMatchRange[] = [];

  for (const { 0: fullMatch, index: character } of line.text
    .slice(0, seekRange.end.character)
    .matchAll(regexp)) {
    const range = line.range.with({
      end: line.range.end.with({
        character: character + fullMatch.length,
      }),
      start: line.range.start.with({ character }),
    });

    if (limit && matches.push({ fullMatch, range }) >= limit) {
      break;
    }
  }

  return matches;
}

/**
 * For testing purposes only. Please don't use it for the extension logic.
 */
const testing = {
  excludeLineRanges,
};

export type { ITokenRange };
export {
  ExcludeLineRangesErrorCode,
  LookupErrorCode,
  testing,
  TokenKind,
  TokenMap,
};
