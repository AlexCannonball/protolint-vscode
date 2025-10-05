import { expect } from 'chai';
import package_ from 'protolint/package.json' with { type: 'json' };
import {
  ConfigurationTarget,
  LanguageStatusSeverity,
  Uri,
  window,
  workspace,
} from 'vscode';

import { CONFIG_COMMAND_KEY } from '../../dist/config.js';
import { CONFIG_SECTION } from '../../dist/constants.js';
import {
  STATUS_DETAIL_UNAVAILABLE,
  STATUS_TEXT,
} from '../../dist/status-item.js';
import {
  appendWorkspaceFolders,
  closeDocuments,
  debugTimeout,
  FIXTURES_DIRECTORY,
  getExecutablePath,
  getTestingApi,
  INVALID_EXECUTABLE_COMMAND,
  promisifyEvent,
  resetCommandConfig,
  resetWorkspaceFolders,
} from '../helpers.js';

import type { ITesting } from '../../dist/extension.js';

type TTestableStatus = Pick<
  ITesting['languageStatus'],
  'busy' | 'detail' | 'severity' | 'text'
>;

const AVAILABLE: TTestableStatus = {
  busy: false,
  detail: package_.version,
  severity: LanguageStatusSeverity.Information,
  text: STATUS_TEXT,
};
const UNAVAILABLE: TTestableStatus = {
  busy: false,
  detail: STATUS_DETAIL_UNAVAILABLE,
  severity: LanguageStatusSeverity.Error,
  text: STATUS_TEXT,
};

const FOLDER = Uri.joinPath(FIXTURES_DIRECTORY, 'status_item');
const DOCUMENT = Uri.joinPath(FOLDER, 'status.proto');

describe('status-item:', function () {
  let languageStatus: ITesting['languageStatus'];
  let executableCache: ITesting['executableCache'];

  function availableAssertion() {
    expect(languageStatus, 'Language status must be available').to.include(
      AVAILABLE,
    );
    expect(
      languageStatus.command,
      'There must be no command in language status',
    ).to.be.undefined;
  }

  function unavailableAssertion() {
    expect(languageStatus, 'Language status must be unavailable').to.include(
      UNAVAILABLE,
    );
    expect(languageStatus.command, 'There must be a command in language status')
      .not.to.be.undefined;
  }

  before('Initialize API-s and parameters', async function () {
    this.timeout(debugTimeout(15_000));

    await closeDocuments();

    await resetCommandConfig();

    await appendWorkspaceFolders([FOLDER]);

    await window.showTextDocument(await workspace.openTextDocument(DOCUMENT), {
      preview: false,
    });

    ({ executableCache, languageStatus } = await getTestingApi());
  });

  after('status-item tests teardown', async function () {
    this.timeout(debugTimeout(10_000));

    await closeDocuments();
    await resetCommandConfig();
    await resetWorkspaceFolders();
  });

  describe('with global configuration', function () {
    afterEach(`global configuration test cleanup`, async function () {
      if (
        workspace
          .getConfiguration(CONFIG_SECTION)
          .inspect<string>(CONFIG_COMMAND_KEY)?.globalValue ===
        getExecutablePath()
      ) {
        return;
      }

      const globalChange = promisifyEvent(
        executableCache.global.onDidChangeStatus,
      );

      await resetCommandConfig();
      await globalChange;
    });

    it('should display available status by default', function () {
      availableAssertion();
    });

    it('should display unavailable status for an invalid executable command', async function () {
      await workspace
        .getConfiguration(CONFIG_SECTION)
        .update(
          CONFIG_COMMAND_KEY,
          INVALID_EXECUTABLE_COMMAND,
          ConfigurationTarget.Global,
        );

      unavailableAssertion();
    });
  });
});
