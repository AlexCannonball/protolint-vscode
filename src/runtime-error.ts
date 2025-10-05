import type { Range, TextDocument } from 'vscode';

import type { TResult } from './constants.js';

/**
 * {@link https://github.com/yoheimuta/go-protoparser/blob/v4.7.0/parser/error.go#L15}
 *
 * Value examples:
 *
 * -
 *     ```console
 *     found \"\\\"option\\\"(Token=2, Pos=file.proto:4:1)\" but expected [;] at /home/runner/go/pkg/mod/github.com/yoheimuta/go-protoparser/v4@v4.7.0/parser/package.go:57. Use -v for more details\n
 *     ```
 *
 * -
 *     ```console
 *     found \"pacskage\" but expected [;]. Use -v for more details\n
 *     ```
 *
 * -
 *     ```console
 *     2023/06/10 21:54:46 Lexer encountered the error \"found \"\\n\" but expected [/[^\\0\\n\\\\]] at /home/runner/go/pkg/mod/github.com/yoheimuta/go-protoparser/v4@v4.7.0/lexer/scanner/strLit.go:29\"\nfound \"\\\"service\\\"(Token=2, Pos=file.proto:9:1)\" but expected [strLit] at /home/runner/go/pkg/mod/github.com/yoheimuta/go-protoparser/v4@v4.7.0/parser/import.go:75. Use -v for more details\n"
 *     ```
 */
const linePattern = /^.*\(Token=\d+, Pos=.+:(?<line>\d+):\d+\).*/m;

/**
 * Value example:
 * ```console
 * found \"pacskage\" but expected [;]. Use -v for more details\n
 * ```
 */
const tokenPattern = /^found "(?<token>.+)".*/;

interface IRuntimeErrorParseError {
  code: 'RUNTIME_ERROR_PARSE_ERROR';
}

function runtimeErrorRange(
  document: TextDocument,
  message: string,
): TResult<Range, IRuntimeErrorParseError> {
  const line = linePattern.exec(message)?.groups?.line;

  if (line !== undefined) {
    return {
      result: 'success',
      value: document.lineAt(Number.parseInt(line) - 1).range,
    };
  }

  const token = tokenPattern.exec(message)?.groups?.token;

  if (token !== undefined) {
    const offset = document.getText().indexOf(token);

    return {
      result: 'success',
      value:
        document.getWordRangeAtPosition(document.positionAt(offset)) ??
        document.lineAt(0).range,
    };
  }

  return {
    error: {
      code: 'RUNTIME_ERROR_PARSE_ERROR',
    },
    result: 'error',
  };
}

export { runtimeErrorRange };
