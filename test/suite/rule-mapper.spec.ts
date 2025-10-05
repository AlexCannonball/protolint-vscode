/* eslint-disable mocha/no-setup-in-describe */

import { expect } from 'chai';
import { Range, workspace } from 'vscode';

// https://github.com/microsoft/vscode-test/issues/265#issuecomment-2073615877
// Probably, paths to the app code unfortunately should have `dist` path.
import {
  codeActions,
  ProtolintDiagnostic,
  testing,
} from '../../dist/rule-mapper.js';
import {
  closeDocuments,
  codeActionAssertion,
  debugTimeout,
  deleteCodeAction,
  enumFieldAppendAction,
  enumFieldPrependAction,
  findProtolintDiagnostic,
  fixAllIndentsAction,
  fixIndentActions,
  getDiagnostics,
  getTestingApi,
  renameFileAction,
  replaceCodeAction,
  resetCommandConfig,
  RULES_FIXTURE,
  RULES_FIXTURE_BASENAME,
} from '../helpers.js';

import type { TextDocument } from 'vscode';

import type { IJsonLintsItem } from '../../dist/json-report-parser.js';
import type { IRuleTest } from '../helpers.js';

const { FIX_KEY, RANGE_KEY } = testing;

describe('rule-mapper:', function () {
  let document: TextDocument;
  let protolintDiagnostics: ProtolintDiagnostic[];
  const tests: IRuleTest[] = [
    {
      actionIndexes: [0],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'TrickyMsgName',
        [RANGE_KEY]: 'trickyMsgName',
      },
      expectedRange: new Range(39, 22, 39, 35),
      rule: 'MESSAGE_NAMES_UPPER_CAMEL_CASE',
      rulePostfix: '',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: deleteCodeAction,
      expectedParsedMessage: {},
      expectedRange: new Range(48, 6, 48, 14),
      rule: 'PROTO3_FIELDS_AVOID_REQUIRED',
      rulePostfix: '',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'tricky_msg_name',
        [RANGE_KEY]: 'trickyMsgName',
      },
      expectedRange: new Range(52, 36, 52, 49),
      rule: 'FIELD_NAMES_LOWER_SNAKE_CASE',
      rulePostfix:
        '(multi-line field with dot separated type and no cardinality)',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'some_array',
        [RANGE_KEY]: 'someArray',
      },
      expectedRange: new Range(83, 23, 83, 32),
      rule: 'FIELD_NAMES_LOWER_SNAKE_CASE',
      rulePostfix: '(field with dot separated type and no cardinality)',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'some_arrays',
        [RANGE_KEY]: 'someArrays',
      },
      expectedRange: new Range(84, 32, 84, 42),
      rule: 'FIELD_NAMES_LOWER_SNAKE_CASE',
      rulePostfix: '(field with dot separated type and cardinality)',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'some_more_arrays',
        [RANGE_KEY]: 'someMoreArrays',
      },
      expectedRange: new Range(86, 23, 86, 37),
      rule: 'FIELD_NAMES_LOWER_SNAKE_CASE',
      rulePostfix: '(multi-line field with dot separated type and cardinality)',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'new_texts',
        [RANGE_KEY]: 'newTexts',
      },
      expectedRange: new Range(87, 18, 87, 26),
      rule: 'FIELD_NAMES_LOWER_SNAKE_CASE',
      rulePostfix: '(field with string type and cardinality)',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'new_number',
        [RANGE_KEY]: 'newNumber',
      },
      expectedRange: new Range(88, 17, 88, 26),
      rule: 'FIELD_NAMES_LOWER_SNAKE_CASE',
      rulePostfix: '(field with int32 type and cardinality)',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'new_number',
        [RANGE_KEY]: 'newNumber',
      },
      expectedRange: new Range(88, 17, 88, 26),
      rule: 'FIELD_NAMES_LOWER_SNAKE_CASE',
      rulePostfix: '(field with int32 type and cardinality)',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'new_string',
        [RANGE_KEY]: 'newString',
      },
      expectedRange: new Range(90, 9, 90, 18),
      rule: 'FIELD_NAMES_LOWER_SNAKE_CASE',
      rulePostfix: '(multi-line field with string type and cardinality)',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'top_content',
        [RANGE_KEY]: 'topContent',
      },
      expectedRange: new Range(91, 8, 91, 18),
      rule: 'FIELD_NAMES_LOWER_SNAKE_CASE',
      rulePostfix: '(field with bytes type and no cardinality)',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'EnumName',
        [RANGE_KEY]: 'enumName',
      },
      expectedRange: new Range(65, 12, 65, 20),
      rule: 'ENUM_NAMES_UPPER_CAMEL_CASE',
      rulePostfix: '',
    },
    {
      actionIndexes: [1],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'CAMEL_CASE',
        [RANGE_KEY]: 'camelCase',
      },
      expectedRange: new Range(68, 12, 68, 21),
      rule: 'ENUM_FIELD_NAMES_UPPER_SNAKE_CASE',
      rulePostfix: '',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'fixture.ranges',
        [RANGE_KEY]: 'Fixture.ranges',
      },
      expectedRange: new Range(7, 19, 7, 33),
      rule: 'PACKAGE_NAME_LOWER_CASE',
      rulePostfix: '',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'GetData',
        [RANGE_KEY]: 'Get_Data',
      },
      expectedRange: new Range(23, 19, 23, 27),
      rule: 'RPC_NAMES_UPPER_CAMEL_CASE',
      rulePostfix: '',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'SampleService',
        [RANGE_KEY]: 'sample_service',
      },
      expectedRange: new Range(18, 27, 18, 41),
      rule: 'SERVICE_NAMES_UPPER_CAMEL_CASE',
      rulePostfix: '',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'elements',
        [RANGE_KEY]: 'element',
      },
      expectedRange: new Range(79, 31, 79, 38),
      rule: 'REPEATED_FIELD_NAMES_PLURALIZED',
      rulePostfix: '',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: replaceCodeAction,
      expectedParsedMessage: {
        [FIX_KEY]: '"google/api/annotations.proto"',
        [RANGE_KEY]: `'google/api/annotations.proto'`,
      },
      expectedRange: new Range(13, 41, 13, 71),
      rule: 'QUOTE_CONSISTENT',
      rulePostfix: '',
    },
    {
      /**
       * See https://github.com/yoheimuta/protolint/issues/349
       */
      actionIndexes: [0],
      expectedCodeActions: fixAllIndentsAction,
      expectedParsedMessage: {},
      expectedRange: new Range(4, 0, 4, 1),
      rule: 'INDENT',
      rulePostfix: `(with 'possible incorrect indentation style')`,
    },
    {
      actionIndexes: [0],
      expectedCodeActions: fixAllIndentsAction,
      expectedParsedMessage: {
        [FIX_KEY]: '',
      },
      expectedRange: new Range(4, 27, 4, 27),
      rule: 'INDENT',
      rulePostfix: `(with the expected error message and 0 whitespaces)`,
    },
    {
      actionIndexes: [0, 1],
      expectedCodeActions: fixIndentActions,
      expectedParsedMessage: {
        [FIX_KEY]: '',
      },
      expectedRange: new Range(15, 26, 15, 27),
      rule: 'INDENT',
      rulePostfix: `(with the expected error message and 1+ whitespaces)`,
    },
    {
      actionIndexes: [1],
      expectedCodeActions: enumFieldAppendAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'UNSPECIFIED',
        [RANGE_KEY]: 'UNKNOWN',
      },
      expectedRange: new Range(66, 13, 66, 20),
      rule: 'ENUM_FIELD_NAMES_ZERO_VALUE_END_WITH',
      rulePostfix: '',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: enumFieldPrependAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'ENUM_NAME',
        [RANGE_KEY]: 'camelCase',
      },
      expectedRange: new Range(68, 12, 68, 21),
      rule: 'ENUM_FIELD_NAMES_PREFIX',
      rulePostfix: '',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: function () {
        return [];
      },
      expectedParsedMessage: {
        [RANGE_KEY]: '80',
      },
      expectedRange: new Range(79, 80, 79, 89),
      rule: 'MAX_LINE_LENGTH',
      rulePostfix: '',
    },
    {
      actionIndexes: [0],
      expectedCodeActions: renameFileAction,
      expectedParsedMessage: {
        [FIX_KEY]: 'rule_mapper.proto',
      },
      expectedRange: new Range(0, 0, 0, 73),
      rule: 'FILE_NAMES_LOWER_SNAKE_CASE',
      rulePostfix: '',
    },
  ];

  before('Initialize API-s and parameters', async function () {
    this.timeout(debugTimeout(10_000));
    await getTestingApi();
    await closeDocuments();
    await resetCommandConfig();

    document = await workspace.openTextDocument(RULES_FIXTURE);

    protolintDiagnostics = await getDiagnostics(document);
  });

  after('rule-mapper tests teardown', async function () {
    await closeDocuments();
  });

  describe('diagnostics and code actions (real protolint integration)', function () {
    // eslint-disable-next-line unicorn/no-array-for-each
    tests.forEach((test) => {
      const postfix = test.rulePostfix ? ` ${test.rulePostfix}` : '';

      describe(`rule '${test.rule}'${postfix}`, function () {
        let actualDiagnostic: ProtolintDiagnostic;

        before(function () {
          actualDiagnostic = findProtolintDiagnostic(
            protolintDiagnostics,
            test.rule,
            test.expectedRange,
          );
        });

        it(`should have the correct 'parsedMessage' object`, function () {
          expect(
            actualDiagnostic.parsedMessage,
            `'parsedMessage' must be correct`,
          ).to.deep.equal(test.expectedParsedMessage);
        });

        it('should return the correct code action(s)', async function () {
          await codeActionAssertion(test, document.uri, actualDiagnostic);
        });
      });
    });
  });

  describe('#defaultRange()', function () {
    describe('when the linter points to a line within the document', function () {
      it('should return the whole line', function () {
        const item: IJsonLintsItem = {
          column: 3,
          filename: RULES_FIXTURE_BASENAME,
          line: 19,
          message: 'foo',
          rule: 'MESSAGE_NAMES_UPPER_CAMEL_CASE',
        };
        const zeroBasedLine = item.line - 1;

        expect(
          testing.defaultRange(document, item),
          `The range must be equal to the whole line #${zeroBasedLine.toString()}`,
        ).to.deep.equal(document.lineAt(zeroBasedLine).range);
      });
    });

    describe('when the linter points to a line outside of the document', function () {
      it('should return the first line', function () {
        const item: IJsonLintsItem = {
          column: -1,
          filename: RULES_FIXTURE_BASENAME,
          line: document.lineCount + 1,
          message: 'UNKNOWN',
          rule: 'UNKNOWN',
        };
        const firstLineRange = document.lineAt(0).range;

        expect(
          testing.defaultRange(document, item),
          `The range for line #${(item.line - 1).toString()} (beyond the document) must be equal to line #0`,
        ).to.deep.equal(firstLineRange);

        item.line = -2;
        expect(
          testing.defaultRange(document, item),
          `The range for line #${(item.line - 1).toString()} (negative) must be equal to line #0`,
        ).to.deep.equal(firstLineRange);
      });
    });
  });

  describe('#diagnosticBase() and codeActions()', function () {
    describe('an unknown rule', function () {
      const item: IJsonLintsItem = {
        column: 1,
        filename: RULES_FIXTURE_BASENAME,
        line: 27,
        message: 'message',
        rule: 'NEW_RULE',
      };
      const zeroBasedLine = item.line - 1;

      it('should return the whole line', function () {
        expect(
          testing.diagnosticBase(document, item),
          `The range for line #${zeroBasedLine.toString()} must be equal to the whole line #${zeroBasedLine.toString()}`,
        ).to.deep.equal({
          parsedMessage: {},
          range: document.lineAt(zeroBasedLine).range,
        });
      });

      it('should return no code actions', function () {
        expect(
          codeActions(document, new ProtolintDiagnostic(document, item)),
        ).to.deep.equal([]);
      });
    });

    describe('an underlying code actions builder function returned an error', function () {
      it('should return no code actions', function () {
        const item: IJsonLintsItem = {
          column: 13,
          filename: RULES_FIXTURE_BASENAME,
          line: 69,
          message: 'Unexpected message',
          rule: 'ENUM_FIELD_NAMES_PREFIX',
        };
        const diagnostic = new ProtolintDiagnostic(document, item);

        expect(
          codeActions(document, diagnostic),
          `No Code Actions must be returned if an error has unexpected 'message'`,
        ).to.be.an('array').that.is.empty;
      });
    });
  });
});
