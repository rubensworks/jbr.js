import { createExperimentPaths } from '../../lib/cli/CliHelpers';
import type { Experiment } from '../../lib/experiment/Experiment';
import type { ExperimentLoader } from '../../lib/task/ExperimentLoader';
import type { ICleanTargets } from '../../lib/task/ICleanTargets';
import type { ITaskContext } from '../../lib/task/ITaskContext';
import { TaskClean } from '../../lib/task/TaskClean';
import { TestLogger } from '../TestLogger';

let experimentLoader: ExperimentLoader;
jest.mock('../../lib/task/ExperimentLoader', () => ({
  ExperimentLoader: {
    ...jest.requireActual('../../lib/task/ExperimentLoader').ExperimentLoader,
    build: jest.fn(() => experimentLoader),
  },
}));

describe('TaskClean', () => {
  let context: ITaskContext;
  let cleanTargets: ICleanTargets;
  let task: TaskClean;
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
    cleanTargets = {
      docker: true,
    };
    task = new TaskClean(context, cleanTargets);

    experiment = <any> {
      clean: jest.fn(),
    };
    experimentLoader = <any> {
      instantiateExperiments: jest.fn(() => ({
        experiments: [ experiment ],
        experimentPathsArray: [ createExperimentPaths('P1') ],
      })),
    };
  });

  describe('clean', () => {
    it('for a valid experiment', async() => {
      await task.clean();
      expect(experiment.clean).toHaveBeenCalledWith(
        { ...context, experimentPaths: createExperimentPaths('P1') },
        cleanTargets,
      );
    });
  });
});
