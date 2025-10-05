import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { logger } from './logger.js';

import type { PerformanceEntry } from 'node:perf_hooks';

import type { LogOutputChannel } from 'vscode';

type TLogLevel = Extract<
  'debug' | 'error' | 'info' | 'trace' | 'warn',
  keyof LogOutputChannel
>;

type TMeasureName = PerformanceEntry['name'];

/**
 * Measures elapsed time.
 *
 * Please manage this with `using` keyword to properly dispose resources.
 */
class Measure implements Disposable {
  #done = false;
  readonly #logLevel: TLogLevel;
  readonly #name: TMeasureName;
  readonly #text: string;

  /**
   * @param logLevel Elapsed time severity in the log output channel
   * @param text The measured operation description
   */
  constructor(logLevel: TLogLevel, text: string) {
    this.#logLevel = logLevel;
    this.#text = text;
    this.#name = randomUUID();

    performance.mark(this.#name);
  }

  /**
   * Stop the measurement and log the elapsed time.
   */
  end(): void {
    if (this.#done) {
      logger.warn(
        `[Measure] Performance measure attempt when it's already done:`,
        this.#name,
        this.#text,
      );

      return;
    }

    performance.measure(this.#name, this.#name);

    for (const { duration, entryType, name } of performance.getEntriesByName(
      this.#name,
      'measure',
    )) {
      if (entryType === 'measure') {
        logger[this.#logLevel](
          `[Measure] ${this.#text} time taken: [${Math.floor(duration).toString()} ms]`,
        );

        performance.clearMeasures(name);
        performance.clearMarks(name);
      }
    }

    this.#done = true;
  }

  [Symbol.dispose](): void {
    if (!this.#done) {
      this.end();
    }
  }
}

export { Measure };
