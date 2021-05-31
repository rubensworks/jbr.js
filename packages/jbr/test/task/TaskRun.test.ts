import * as Path from 'path';
import type { Experiment } from '../../lib/experiment/Experiment';
import type { ExperimentLoader } from '../../lib/task/ExperimentLoader';
import { TaskRun } from '../../lib/task/TaskRun';

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
    files = {};
  });

  describe('run', () => {
    it('runs an experiment with an existing marker file', async() => {
      files[Path.join('CWD', 'generated', '.prepared')] = true;
      await task.run();
      expect(experiment.run)
        .toHaveBeenCalledWith({ cwd: 'CWD', mainModulePath: 'MMP', verbose: true, exitProcess: expect.anything() });
    });

    it('throws without an existing marker file', async() => {
      await expect(task.run()).rejects.toThrowError(`The experiment at 'CWD' has not been prepared successfully yet, invoke 'jbr prepare' first.`);
    });
  });
});
