import type { Experiment } from '../../lib/experiment/Experiment';
import type { ExperimentLoader } from '../../lib/task/ExperimentLoader';
import { TaskPrepare } from '../../lib/task/TaskPrepare';

let experimentLoader: ExperimentLoader;
jest.mock('../../lib/task/ExperimentLoader', () => ({
  ExperimentLoader: {
    ...jest.requireActual('../../lib/task/ExperimentLoader').ExperimentLoader,
    build: jest.fn(() => experimentLoader),
    getDefaultExperimentIri: () => 'IRI',
  },
}));

describe('TaskPrepare', () => {
  let task: TaskPrepare;
  let experiment: Experiment;
  beforeEach(() => {
    task = new TaskPrepare(
      { cwd: 'CWD', mainModulePath: 'MMP', verbose: true },
    );

    experiment = <any> {
      prepare: jest.fn(),
    };
    experimentLoader = <any> {
      instantiateFromPath: jest.fn(() => experiment),
    };
  });

  describe('prepare', () => {
    it('prepares an experiment', async() => {
      await task.prepare();
      expect(experiment.prepare).toHaveBeenCalledWith({ cwd: 'CWD', mainModulePath: 'MMP', verbose: true });
    });
  });
});
