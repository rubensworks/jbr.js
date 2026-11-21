import * as fs from 'node:fs';
import * as Path from 'node:path';
import type { ITaskContext } from 'jbr';
import { CliProcessHandler, createExperimentPaths } from 'jbr';
import { TestLogger } from '../../jbr/test/TestLogger';
import { HookCli } from '../lib/HookCli';

const execSpy = jest.spyOn(require('node:child_process'), 'spawn');

jest.mock<any>('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  createWriteStream: jest.fn(() => ({
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  })),
}));

describe('HookCli', () => {
  let logger: any;
  let context: ITaskContext;
  let hook: HookCli;
  beforeEach(() => {
    jest.clearAllMocks();
    logger = <any> new TestLogger();
    context = {
      cwd: 'CWD',
      experimentPaths: createExperimentPaths('CWD'),
      experimentName: 'EXP',
      mainModulePath: 'MMP',
      verbose: true,
      closeExperiment: jest.fn(),
      cleanupHandlers: [],
      logger,
      docker: <any> {},
    };
    hook = new HookCli(
      [ 'echo', '"HI"' ],
      'stats.csv',
    );
  });

  describe('prepare', () => {
    it('does nothing', async() => {
      await hook.prepare(context, false);
    });
  });

  describe('start', () => {
    it('should start the hook', async() => {
      const handler = await hook.start(context);

      expect(execSpy).toHaveBeenCalledWith('echo', [ '"HI"' ], { detached: process.platform !== 'win32' });
      expect((<CliProcessHandler> handler).processGroup).toBe(process.platform !== 'win32');
      expect(handler).toBeInstanceOf(CliProcessHandler);
      expect(fs.createWriteStream).toHaveBeenCalledWith(Path.join('CWD', 'output', 'logs', 'cli-stdout.txt'), 'utf8');
      expect(fs.createWriteStream).toHaveBeenCalledWith(Path.join('CWD', 'output', 'logs', 'cli-stderr.txt'), 'utf8');
    });

    it('should include the log name in the names of the log files', async() => {
      hook = new HookCli([ 'echo', '"HI"' ], undefined, 'source-1');
      await hook.start(context);

      const logs = Path.join('CWD', 'output', 'logs');
      expect(fs.createWriteStream).toHaveBeenCalledWith(Path.join(logs, 'cli-source-1-stdout.txt'), 'utf8');
      expect(fs.createWriteStream).toHaveBeenCalledWith(Path.join(logs, 'cli-source-1-stderr.txt'), 'utf8');
    });
  });

  describe('clean', () => {
    it('does nothing', async() => {
      await hook.clean(context, {});
    });
  });
});
