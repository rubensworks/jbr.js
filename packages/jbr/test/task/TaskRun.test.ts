import type { Experiment } from '../../lib/experiment/Experiment';
import type { ExperimentLoader } from '../../lib/task/ExperimentLoader';
import { TaskRun } from '../../lib/task/TaskRun';

let experimentLoader: ExperimentLoader;
jest.mock('../../lib/task/ExperimentLoader', () => ({
  ExperimentLoader: {
    ...jest.requireActual('../../lib/task/ExperimentLoader').ExperimentLoader,
    build: jest.fn(() => experimentLoader),
    getDefaultExperimentIri: () => 'IRI',
  },
}));

describe('TaskRun', () => {
  let task: TaskRun;
  let experiment: Experiment;
  beforeEach(() => {
    task = new TaskRun(
      { cwd: 'CWD', mainModulePath: 'MMP', verbose: true, exitProcess: jest.fn() },
    );

    experiment = <any> {
      run: jest.fn(),
    };
    experimentLoader = <any> {
      instantiateFromPath: jest.fn(() => experiment),
    };
  });

  describe('run', () => {
    it('runs an experiment', async() => {
      await task.run();
      expect(experiment.run)
        .toHaveBeenCalledWith({ cwd: 'CWD', mainModulePath: 'MMP', verbose: true, exitProcess: expect.anything() });
    });
  });
});
