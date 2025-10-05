import { expect } from 'chai';
import { Range, workspace } from 'vscode';

import {
  ExcludeLineRangesErrorCode,
  testing,
} from '../../dist/protobuf-parser.js';
import { closeDocuments, RULES_FIXTURE } from '../helpers.js';

import type { TextDocument } from 'vscode';

import type { ITokenRange } from '../../dist/protobuf-parser.js';

function prepareRanges(
  document: TextDocument,
  items: Pick<ITokenRange, 'closed' | 'range'>[],
): ITokenRange[] {
  return items.map((item) => ({
    ...item,
    fullMatch: document.getText(item.range),
  }));
}

const methodName = testing.excludeLineRanges.name;

function excludeLineRanges(
  ...arguments_: Parameters<typeof testing.excludeLineRanges>
): Range[] {
  const result = testing.excludeLineRanges(...arguments_);

  if (result.result === 'error') {
    expect.fail(`'${methodName}' didn't return success`);
  }

  return result.value;
}

describe('protobuf-parser:', function () {
  let document: TextDocument;

  before('Initialize API-s and parameters', async function () {
    await closeDocuments();
    document = await workspace.openTextDocument(RULES_FIXTURE);
  });

  after('protobuf-parser tests teardown', async function () {
    await closeDocuments();
  });

  describe(`#excludeLineRanges()`, function () {
    describe('when an input range covers the line start', function () {
      it(`shouldn't return a range for the line start`, function () {
        const line = document.lineAt(18);
        const character = 26;
        const range = line.range.with({
          end: line.range.end.with({ character }),
        });
        const inputRanges = prepareRanges(document, [
          {
            closed: true,
            range,
          },
        ]);
        const actualRanges = excludeLineRanges(line, inputRanges);
        const expectedRanges: Range[] = [line.range.with({ start: range.end })];

        expect(
          actualRanges,
          `'${methodName}' must not return the leftmost segment`,
        ).to.deep.equal(expectedRanges);
      });
    });

    describe('when an input range covers the line end', function () {
      it(`shouldn't return a range for the line end`, function () {
        const line = document.lineAt(52);
        const inputRanges = prepareRanges(document, [
          {
            closed: true,
            range: line.range.with({
              end: line.range.end.with({ character: 17 }),
            }),
          },
          {
            closed: true,
            range: line.range.with({
              end: line.range.end.with({ character: 35 }),
              start: line.range.start.with({ character: 18 }),
            }),
          },
          {
            closed: true,
            range: line.range.with({
              end: line.range.end.with({ character: 67 }),
              start: line.range.start.with({ character: 50 }),
            }),
          },
        ]);
        const actualRanges = excludeLineRanges(line, inputRanges);
        const expectedRanges: Range[] = [
          new Range(inputRanges[0].range.end, inputRanges[1].range.start),
          new Range(inputRanges[1].range.end, inputRanges[2].range.start),
        ];

        expect(
          actualRanges,
          `'${methodName}' must not return the rightmost segment`,
        ).to.deep.equal(expectedRanges);
      });
    });

    describe('when there is a text before and after one comment', function () {
      it('should return two properly ordered ranges', function () {
        const line = document.lineAt(23);
        const range = line.range.with({
          end: line.range.end.with({ character: 19 }),
          start: line.range.start.with({ character: 2 }),
        });
        const inputRanges = prepareRanges(document, [
          {
            closed: true,
            range,
          },
        ]);
        const actualRanges = excludeLineRanges(line, inputRanges);
        const expectedRanges: Range[] = [
          line.range.with({ end: range.start }),
          line.range.with({ start: range.end }),
        ];

        expect(
          actualRanges,
          `'${methodName}' must return the correct segments`,
        ).to.deep.equal(expectedRanges);
      });
    });

    describe('when two ranges intersect', function () {
      it('should return range intersection error', function () {
        const line = document.lineAt(23);
        const inputRanges = prepareRanges(document, [
          {
            closed: true,
            range: line.range.with({
              end: line.range.end.with({ character: 19 }),
              start: line.range.start.with({ character: 2 }),
            }),
          },
          {
            closed: true,
            range: line.range.with({
              end: line.range.end.with({ character: 15 }),
            }),
          },
        ]);

        const actualRanges = testing.excludeLineRanges(line, inputRanges);
        const expectedRanges: ReturnType<typeof testing.excludeLineRanges> = {
          error: { code: ExcludeLineRangesErrorCode.RangeIntersection },
          result: 'error',
        };

        if (actualRanges.result === 'error') {
          expect(
            actualRanges,
            `The error code '${expectedRanges.error.code}' must be returned`,
          ).to.deep.equal(expectedRanges);
        } else {
          expect.fail(`'${methodName}' didn't return error`);
        }
      });
    });

    describe('when providing 0 ranges to invert', function () {
      it('should return the line range', function () {
        const line = document.lineAt(23);
        const actualRanges = excludeLineRanges(line, []);

        expect(
          actualRanges,
          `'${methodName}' must return the line #${line.range.start.line.toString()} range`,
        ).to.deep.equal([line.range]);
      });
    });

    describe('when the input ranges cover the entire line', function () {
      it(`shouldn't affect the result correctness`, function () {
        const line = document.lineAt(14);
        const character = 26;
        const inputRanges = prepareRanges(document, [
          {
            closed: true,
            range: line.range.with({ end: line.range.end.with({ character }) }),
          },
          {
            closed: true,
            range: line.range.with({
              start: line.range.start.with({ character }),
            }),
          },
        ]);
        const actualRanges = excludeLineRanges(line, inputRanges);

        expect(
          actualRanges,
          `'${methodName}' must return empty array`,
        ).to.be.an('array').that.is.empty;
      });
    });

    describe('when input ranges are touching', function () {
      it(`shouldn't return ranges for touching points`, function () {
        const line = document.lineAt(66);
        const start = 2;
        const touching1 = 13;
        const touching2 = 20;
        const end = 31;
        const inputRanges = prepareRanges(document, [
          {
            closed: true,
            range: line.range.with({
              end: line.range.end.with({ character: touching1 }),
              start: line.range.start.with({ character: start }),
            }),
          },
          {
            closed: true,
            range: line.range.with({
              end: line.range.end.with({ character: touching2 }),
              start: line.range.start.with({ character: touching1 }),
            }),
          },
          {
            closed: true,
            range: line.range.with({
              end: line.range.end.with({ character: end }),
              start: line.range.start.with({ character: touching2 }),
            }),
          },
        ]);

        const actualRanges = excludeLineRanges(line, inputRanges);
        const expectedRanges: Range[] = [
          line.range.with({ end: line.range.end.with({ character: start }) }),
          line.range.with({
            start: line.range.start.with({ character: end }),
          }),
        ];

        expect(
          actualRanges,
          `'${methodName}' must not return touching points`,
        ).to.deep.equal(expectedRanges);
      });
    });

    describe('when input ranges are not ordered', function () {
      it(`shouldn't affect the result correctness`, function () {
        const line = document.lineAt(66);
        const start = 2;
        const touching1 = 13;
        const touching2 = 20;
        const end = 31;
        const inputRanges = prepareRanges(document, [
          {
            closed: true,
            range: new Range(
              line.range.start.with({ character: touching1 }),
              line.range.end.with({ character: touching2 }),
            ),
          },
          {
            closed: true,
            range: new Range(
              line.range.start.with({ character: touching2 }),
              line.range.end.with({ character: end }),
            ),
          },
          {
            closed: true,
            range: new Range(
              line.range.start.with({ character: start }),
              line.range.end.with({ character: touching1 }),
            ),
          },
        ]);

        const actualRanges = excludeLineRanges(line, inputRanges);
        const expectedRanges: Range[] = [
          line.range.with({ end: line.range.end.with({ character: start }) }),
          line.range.with({ start: line.range.start.with({ character: end }) }),
        ];

        expect(
          actualRanges,
          `'${methodName}' must return the correct result for unordered input`,
        ).to.deep.equal(expectedRanges);
      });
    });
  });
});
