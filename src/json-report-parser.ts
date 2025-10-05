import type { TResult } from './constants.js';

enum ParseJsonErrorCode {
  Failed = 'JSON_PARSE_FAILED',
  UnexpectedSchema = 'UNEXPECTED_JSON_SCHEMA',
}

/**
 * Linting errors extracted from `protolint` stderr
 * {@link https://github.com/yoheimuta/protolint/blob/v0.43.2/README.md#reporters JSON-formatted}
 * report.
 *
 * Use only when running `protolint` with `-reporter json` flag.
 *
 * It's not applicable when `protolint`
 * {@link https://github.com/yoheimuta/protolint/blob/v0.43.2/README.md#exit-codes exit code}
 * is not 1.
 */
interface IJsonLints {
  lints: IJsonLintsItem[];
}

/**
 * A single `protolint` linting error item.
 */
interface IJsonLintsItem {
  column: number;
  filename: string;
  line: number;
  message: string;
  rule: string;
}

interface IParseJsonError {
  code: ParseJsonErrorCode;
  error?: Error;
}

/**
 * Type guard for `protolint` stderr in JSON format.
 * @param argument - an object to validate against {@link IJsonLints} type
 * @returns `true` if it's {@link IJsonLints} type
 */
function isJsonLints(argument: unknown): argument is IJsonLints {
  return (
    typeof argument === 'object' &&
    argument !== null &&
    'lints' in argument &&
    Array.isArray(argument.lints) &&
    argument.lints.every((value) => isJsonLintsItem(value))
  );
}

/**
 * Type guard for a single `protolint` stderr entry.
 * @param argument - an object to validate against {@link IJsonLintsItem} type
 * @returns `true` if it's {@link IJsonLintsItem}
 */
function isJsonLintsItem(argument: unknown): argument is IJsonLintsItem {
  return (
    typeof argument === 'object' &&
    argument !== null &&
    'filename' in argument &&
    typeof argument.filename === 'string' &&
    'line' in argument &&
    typeof argument.line === 'number' &&
    'column' in argument &&
    typeof argument.column === 'number' &&
    'message' in argument &&
    typeof argument.message === 'string' &&
    'rule' in argument &&
    typeof argument.rule === 'string'
  );
}

/**
 * Parses `stderr` assuming it was obtained via `protolint lint -reporter json`
 * command.
 *
 * @param stderr - `protolint` stderr in JSON format
 * @returns array of {@link IJsonLintsItem} if parsed successfully.
 */
function parseJsonStderr(
  stderr: string,
): TResult<IJsonLintsItem[], IParseJsonError> {
  let result: unknown;

  try {
    result = JSON.parse(stderr);
  } catch (error) {
    return {
      error: {
        code: ParseJsonErrorCode.Failed,
        ...(error instanceof Error && { error }),
      },
      result: 'error',
    };
  }

  if (!isJsonLints(result)) {
    return {
      error: { code: ParseJsonErrorCode.UnexpectedSchema },
      result: 'error',
    };
  }

  return { result: 'success', value: result.lints };
}

export type { IJsonLintsItem };
export { parseJsonStderr };
