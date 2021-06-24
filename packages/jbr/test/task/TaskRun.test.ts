import * as Path from 'path';
import { createExperimentPaths } from '../../lib/cli/CliHelpers';
import type { Experiment } from '../../lib/experiment/Experiment';
import type { ExperimentLoader } from '../../lib/task/ExperimentLoader';
import type { ITaskContext } from '../../lib/task/ITaskContext';
import { TaskRun } from '../../lib/task/TaskRun';
import { TestLogger } from '../TestLogger';

let experimentLoader: ExperimentLoader;
jest.mock('../../lib/task/ExperimentLoader', () => ({
  ExperimentLoader: {
    ...jest.requireActual('../../lib/task/ExperimentLoader').ExperimentLoader,
    build: jest.fn(() => experimentLoader),
    getDefaultExperimentIri: () => 'IRI',
    requireExperimentPrepared: jest.requireActual('../../lib/task/ExperimentLoader')
      .ExperimentLoader.requireExperimentPrepared,
  },
}));

let files: Record<string, string | boolean> = {};
jest.mock('fs-extra', () => ({
  ...jest.requireActual('fs-extra'),
  async pathExists(filePath: string) {
    return filePath in files;
  },
}));

describe('TaskRun', () => {
  let context: ITaskContext;
  let task: TaskRun;
  let experiment: Experiment;
  beforeEach(() => {
    context = {
      cwd: 'CWD',
      experimentPaths: createExperimentPaths('CWD'),
      mainModulePath: 'MMP',
      verbose: true,
      cleanupHandlers: [],
      logger: <any> new TestLogger(),
      docker: <any> {},
    };
    task = new TaskRun(context);

    experiment = <any> {
      run: jest.fn(),
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
  });

  describe('run', () => {
    it('runs an experiment with an existing marker file', async() => {
      files[Path.join('CWD', 'generated', '.prepared')] = true;
      await task.run();
      expect(experiment.run).toHaveBeenCalledWith(context);

      expect(context.logger.info).toHaveBeenCalledTimes(0);
    });

    it('throws without an existing marker file', async() => {
      await expect(task.run()).rejects.toThrowError(`The experiment at 'CWD' has not been prepared successfully yet, invoke 'jbr prepare' first.`);
    });

    it('runs multiple experiments', async() => {
      const experiment1 = <any> {
        run: jest.fn(),
      };
      const experiment2 = <any> {
        run: jest.fn(),
      };
      const expPaths1 = createExperimentPaths('CWD/1');
      const expPaths2 = createExperimentPaths('CWD/2');
      (<any> experimentLoader).instantiateExperiments = jest.fn(() => {
        return {
          experimentPathsArray: [ expPaths1, expPaths2 ],
          experiments: [ experiment1, experiment2 ],
        };
      });

      files[Path.join('CWD', 'generated', '.prepared')] = true;
      await task.run();
      expect(experiment1.run).toHaveBeenCalledWith({ ...context, experimentPaths: expPaths1 });
      expect(experiment2.run).toHaveBeenCalledWith({ ...context, experimentPaths: expPaths2 });

      expect(context.logger.info).toHaveBeenCalledTimes(2);
    });
  });
});
