import * as Path from 'path';
import type { Experiment } from '../../lib/experiment/Experiment';
import { ExperimentLoader } from '../../lib/task/ExperimentLoader';
import { TaskValidate } from '../../lib/task/TaskValidate';
import { TestLogger } from '../TestLogger';

let experimentLoader: ExperimentLoader;
jest.mock('../../lib/task/ExperimentLoader', () => ({
  ExperimentLoader: {
    ...jest.requireActual('../../lib/task/ExperimentLoader').ExperimentLoader,
    build: jest.fn(() => experimentLoader),
    getDefaultExperimentIri: () => 'IRI',
  },
}));

let files: Record<string, boolean> = {};
jest.mock('fs-extra', () => ({
  ...jest.requireActual('fs-extra'),
  async pathExists(filePath: string) {
    return filePath in files;
  },
}));

describe('TaskValidate', () => {
  let task: TaskValidate;
  let experiment: Experiment;
  beforeEach(() => {
    task = new TaskValidate(
      { cwd: 'CWD', mainModulePath: 'MMP', verbose: true, exitProcess: jest.fn(), logger: <any> new TestLogger() },
    );

    experiment = <any> {
      run: jest.fn(),
    };
    experimentLoader = <any> {
      instantiateFromPath: jest.fn(() => experiment),
    };
    files = {};
  });

  describe('validate', () => {
    it('for a valid experiment', async() => {
      files[Path.join('CWD', ExperimentLoader.CONFIG_NAME)] = true;
      files[Path.join('CWD', ExperimentLoader.PACKAGEJSON_NAME)] = true;
      await task.validate();
    });

    it('for missing files', async() => {
      await expect(task.validate()).rejects.toThrowError(`Experiment validation failed:
  - Missing 'jbr-experiment.json' file
  - Missing 'package.json' file

Make sure you invoke this command in a directory created with 'jbr init'`);
    });

    it('for missing files and failing instantiation', async() => {
      experimentLoader.instantiateFromPath = async() => {
        throw new Error('Instantiation error in TaskValidate test');
      };
      await expect(task.validate()).rejects.toThrowError(`Experiment validation failed:
  - Missing 'jbr-experiment.json' file
  - Missing 'package.json' file
  - Invalid jbr-experiment.json file: Instantiation error in TaskValidate test

Make sure you invoke this command in a directory created with 'jbr init'`);
    });
  });
});
