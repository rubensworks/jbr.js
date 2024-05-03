import type { ITaskContext } from 'jbr';
import { CliProcessHandler, createExperimentPaths } from 'jbr';
import { TestLogger } from '../../jbr/test/TestLogger';
import { HookCli } from '../lib/HookCli';

const execSpy = jest.spyOn(require('node:child_process'), 'execFile');

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
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

      expect(execSpy).toHaveBeenCalledWith('echo', [ '"HI"' ]);
      expect(handler).toBeInstanceOf(CliProcessHandler);
    });
  });

  describe('clean', () => {
    it('does nothing', async() => {
      await hook.clean(context, {});
    });
  });
});
