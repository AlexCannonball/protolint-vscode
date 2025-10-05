import { commands, ExtensionMode } from 'vscode';

import { ExecutableCache } from './config.js';
import {
  SUPPORTED_LANGUAGE_IDS,
  SUPPORTED_LANGUAGE_IDS_CONTEXT_KEY,
} from './constants.js';
import { Diagnostics } from './diagnostics.js';
import { Executable } from './executable.js';
import { Fixer } from './fixer.js';
import { activateLogging } from './logger.js';
import { LanguageStatusUpdater } from './status-item.js';

import type { ExtensionContext, LanguageStatusItem } from 'vscode';

interface ITesting {
  readonly executableCache: Readonly<Omit<ExecutableCache, 'dispose'>>;
  readonly languageStatus: Readonly<Omit<LanguageStatusItem, 'dispose'>>;
}

async function activate(
  context: ExtensionContext,
): Promise<ITesting | undefined> {
  activateLogging(context);

  Executable.setMode(context.extensionMode);

  await Fixer.initialize(context);

  await Diagnostics.initialize(context);

  const languageStatus = await LanguageStatusUpdater.createInstance(context);

  await commands.executeCommand(
    'setContext',
    SUPPORTED_LANGUAGE_IDS_CONTEXT_KEY,
    SUPPORTED_LANGUAGE_IDS,
  );

  if (context.extensionMode === ExtensionMode.Test) {
    return {
      executableCache: await ExecutableCache.getInstance(context),
      languageStatus,
    };
  }
}

export type { ITesting };
export { activate };
