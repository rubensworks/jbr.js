import * as Path from 'path';
import { createExperimentPaths } from '../../lib/cli/CliHelpers';
import type { Experiment } from '../../lib/experiment/Experiment';
import type { ExperimentLoader } from '../../lib/task/ExperimentLoader';
import type { ITaskContext } from '../../lib/task/ITaskContext';
import { TaskPrepare } from '../../lib/task/TaskPrepare';
import { TestLogger } from '../TestLogger';

let experimentLoader: ExperimentLoader;
jest.mock('../../lib/task/ExperimentLoader', () => ({
  ExperimentLoader: {
    ...jest.requireActual('../../lib/task/ExperimentLoader').ExperimentLoader,
    build: jest.fn(() => experimentLoader),
    getDefaultExperimentIri: () => 'IRI',
    getPreparedMarkerPath: jest.requireActual('../../lib/task/ExperimentLoader').ExperimentLoader.getPreparedMarkerPath,
  },
}));

let files: Record<string, string | boolean> = {};
let filesUnlinked: Record<string, boolean> = {};
jest.mock('fs-extra', () => ({
  ...jest.requireActual('fs-extra'),
  async pathExists(filePath: string) {
    return filePath in files;
  },
  async unlink(filePath: string) {
    filesUnlinked[filePath] = true;
    delete files[filePath];
  },
  async writeFile(filePath: string, data: string) {
    files[filePath] = data;
  },
}));

describe('TaskPrepare', () => {
  let context: ITaskContext;
  let task: TaskPrepare;
  let experiment: Experiment;
  beforeEach(() => {
    context = {
      cwd: 'CWD',
      experimentPaths: createExperimentPaths('CWD'),
      experimentName: 'EXP',
      mainModulePath: 'MMP',
      verbose: true,
      closeExperiment: jest.fn(),
      cleanupHandlers: [],
      logger: <any> new TestLogger(),
      docker: <any> {},
    };
    task = new TaskPrepare(
      context,
      false,
    );

    experiment = <any> {
      prepare: jest.fn(),
    };
    experimentLoader = <any> {
      instantiateExperiments: jest.fn(() => {
        return {
          experimentPathsArray: [ createExperimentPaths('CWD') ],
          experiments: [ experiment ],
        };
      }),
    };
    files = {};
    filesUnlinked = {};
  });

  describe('prepare', () => {
    it('prepares an experiment', async() => {
      await task.prepare();
      expect(experiment.prepare)
        .toHaveBeenCalledWith(context, false);

      expect(filesUnlinked[Path.join('CWD', 'generated', '.prepared')]).toBeFalsy();
      expect(files[Path.join('CWD', 'generated', '.prepared')]).toEqual('');

      expect(context.logger.info).toHaveBeenCalledTimes(1);
    });

    it('prepares an experiment forcefully', async() => {
      task = new TaskPrepare(
        context,
        true,
      );

      await task.prepare();
      expect(experiment.prepare)
        .toHaveBeenCalledWith(context, true);

      expect(filesUnlinked[Path.join('CWD', 'generated', '.prepared')]).toBeFalsy();
      expect(files[Path.join('CWD', 'generated', '.prepared')]).toEqual('');

      expect(context.logger.info).toHaveBeenCalledTimes(1);
    });

    it('prepares an experiment with an existing marker file', async() => {
      files[Path.join('CWD', 'generated', '.prepared')] = '';

      await task.prepare();
      expect(experiment.prepare)
        .toHaveBeenCalledWith(context, false);

      expect(filesUnlinked[Path.join('CWD', 'generated', '.prepared')]).toBeTruthy();
      expect(files[Path.join('CWD', 'generated', '.prepared')]).toEqual('');

      expect(context.logger.info).toHaveBeenCalledTimes(1);
    });

    it('prepares multiple experiments', async() => {
      const experiment1 = <any> {
        prepare: jest.fn(),
      };
      const experiment2 = <any> {
        prepare: jest.fn(),
      };
      const expPaths1 = createExperimentPaths('CWD/1');
      const expPaths2 = createExperimentPaths('CWD/2');
      (<any> experimentLoader).instantiateExperiments = jest.fn(() => {
        return {
          experimentPathsArray: [ expPaths1, expPaths2 ],
          experiments: [ experiment1, experiment2 ],
        };
      });

      await task.prepare();
      expect(experiment1.prepare)
        .toHaveBeenCalledWith({ ...context, experimentPaths: expPaths1 }, false);
      expect(experiment2.prepare)
        .toHaveBeenCalledWith({ ...context, experimentPaths: expPaths2 }, false);

      expect(filesUnlinked[Path.join('CWD', 'generated', '.prepared')]).toBeFalsy();
      expect(files[Path.join('CWD', 'generated', '.prepared')]).toEqual('');

      expect(context.logger.info).toHaveBeenCalledTimes(2);
    });

    it('prepares multiple experiments with common prepare', async() => {
      const experiment1 = <any> {
        prepare: jest.fn(),
      };
      const experiment2 = <any> {
        prepare: jest.fn(),
      };
      const expPaths1 = createExperimentPaths('CWD1');
      const expPaths2 = createExperimentPaths('CWD1');
      (<any> experimentLoader).instantiateExperiments = jest.fn(() => {
        return {
          combinationProvider: { commonPrepare: true },
          experimentPathsArray: [ expPaths1, expPaths2 ],
          experiments: [ experiment1, experiment2 ],
        };
      });

      await task.prepare();
      expect(experiment1.prepare)
        .toHaveBeenCalledWith({ ...context, experimentPaths: expPaths1 }, false);
      expect(experiment2.prepare)
        .toHaveBeenCalledWith({ ...context, experimentPaths: expPaths2 }, false);

      expect(filesUnlinked[Path.join('CWD', 'generated', '.prepared')]).toBeFalsy();
      expect(files[Path.join('CWD', 'generated', '.prepared')]).toEqual('');

      expect(context.logger.info).toHaveBeenCalledTimes(2);
    });
  });
});
