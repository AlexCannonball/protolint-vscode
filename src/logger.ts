import { LogLevel, window } from 'vscode';

import type { ExtensionContext, LogOutputChannel } from 'vscode';

import type { TExtractListener } from './helpers.js';

let activated = false;

/**
 * The extension logger.
 */
const logger = window.createOutputChannel('protolint', { log: true });
const logLevelListener: TExtractListener<
  LogOutputChannel['onDidChangeLogLevel']
> = function (logLevel) {
  logger.appendLine(`[Logger] Log level: ${LogLevel[logLevel]}`);
};

/**
 * Activates log output channel for the extension.
 */
function activateLogging({
  subscriptions: disposables,
}: ExtensionContext): void {
  if (activated) {
    logger.warn(
      '[Logger] Logging has been already activated, ignoring a duplicate request',
    );

    return;
  }

  disposables.push(logger);
  logger.onDidChangeLogLevel(logLevelListener, undefined, disposables);
  logLevelListener(logger.logLevel);

  activated = true;
}

export { activateLogging, logger };
