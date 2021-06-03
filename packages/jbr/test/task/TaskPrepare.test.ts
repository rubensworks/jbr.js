import * as Path from 'path';
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
      mainModulePath: 'MMP',
      verbose: true,
      cleanupHandlers: [],
      logger: <any> new TestLogger(),
      docker: <any> {},
    };
    task = new TaskPrepare(
      context,
    );

    experiment = <any> {
      prepare: jest.fn(),
    };
    experimentLoader = <any> {
      instantiateFromPath: jest.fn(() => experiment),
    };
    files = {};
    filesUnlinked = {};
  });

  describe('prepare', () => {
    it('prepares an experiment', async() => {
      await task.prepare();
      expect(experiment.prepare)
        .toHaveBeenCalledWith(context);

      expect(filesUnlinked[Path.join('CWD', 'generated', '.prepared')]).toBeFalsy();
      expect(files[Path.join('CWD', 'generated', '.prepared')]).toEqual('');
    });

    it('prepares an experiment with an existing marker file', async() => {
      files[Path.join('CWD', 'generated', '.prepared')] = '';

      await task.prepare();
      expect(experiment.prepare)
        .toHaveBeenCalledWith(context);

      expect(filesUnlinked[Path.join('CWD', 'generated', '.prepared')]).toBeTruthy();
      expect(files[Path.join('CWD', 'generated', '.prepared')]).toEqual('');
    });
  });
});
