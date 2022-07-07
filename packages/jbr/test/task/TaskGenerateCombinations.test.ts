import * as Path from 'path';
import { createExperimentPaths } from '../../lib/cli/CliHelpers';
import type { Experiment } from '../../lib/experiment/Experiment';
import type { ExperimentLoader } from '../../lib/task/ExperimentLoader';
import type { ITaskContext } from '../../lib/task/ITaskContext';
import { TaskGenerateCombinations } from '../../lib/task/TaskGenerateCombinations';
import { TestLogger } from '../TestLogger';

let experimentLoader: ExperimentLoader;
jest.mock('../../lib/task/ExperimentLoader', () => ({
  ExperimentLoader: {
    ...jest.requireActual('../../lib/task/ExperimentLoader').ExperimentLoader,
    build: jest.fn(() => experimentLoader),
    requireCombinationsExperiment: jest.requireActual('../../lib/task/ExperimentLoader')
      .ExperimentLoader.requireCombinationsExperiment,
    getCombinationIdString: jest.requireActual('../../lib/task/ExperimentLoader')
      .ExperimentLoader.getCombinationIdString,
    getDefaultExperimentIri: jest.requireActual('../../lib/task/ExperimentLoader')
      .ExperimentLoader.getDefaultExperimentIri,
    getCombinationExperimentIri: jest.requireActual('../../lib/task/ExperimentLoader')
      .ExperimentLoader.getCombinationExperimentIri,
  },
}));

let files: Record<string, string | boolean> = {};
let symlinks: Record<string, string> = {};
let filesUnlinked: Record<string, boolean> = {};
jest.mock('fs-extra', () => ({
  ...jest.requireActual('fs-extra'),
  async readdir(sourceDirectory: string) {
    const entries: any[] = [];
    for (const file of Object.keys(files)) {
      if (file.startsWith(sourceDirectory) && file.length > sourceDirectory.length) {
        entries.push({
          name: file.slice(sourceDirectory.length),
          isFile: () => !file.endsWith('/') && !file.includes('%'),
          isDirectory: () => file.endsWith('/') && !file.includes('%'),
        });
      }
    }
    return entries;
  },
  async readFile(filePath: string) {
    return files[filePath];
  },
  async pathExists(filePath: string) {
    return filePath in files;
  },
  async unlink(filePath: string) {
    filesUnlinked[filePath] = true;
    delete files[filePath];
  },
  async symlink(from: string, to: string) {
    symlinks[from] = to;
  },
  async writeFile(filePath: string, data: string) {
    files[filePath] = data;
  },
  async mkdirp(dirPath: string) {
    files[dirPath] = true;
  },
  async mkdir(dirPath: string) {
    files[dirPath] = true;
  },
}));

describe('TaskGenerateCombinations', () => {
  let context: ITaskContext;
  let task: TaskGenerateCombinations;
  let experiment: Experiment;
  beforeEach(() => {
    context = {
      cwd: 'CWD',
      experimentPaths: createExperimentPaths('CWD'),
      mainModulePath: 'MMP',
      verbose: true,
      closeExperiment: jest.fn(),
      cleanupHandlers: [],
      logger: <any> new TestLogger(),
      docker: <any> {},
    };
    task = new TaskGenerateCombinations(
      context,
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
      instantiateCombinationProvider: jest.fn(() => ({
        getFactorCombinations: jest.fn(() => [{ a: 0 }, { a: 1 }]),
      })),
    };
    files = {};
    filesUnlinked = {};
    symlinks = {};
  });

  describe('generate', () => {
    it('generates combinations', async() => {
      files[Path.join('CWD', 'jbr-experiment.json.template')] = `TEMPLATE %FACTOR-a%`;
      files[Path.join('CWD', 'jbr-combinations.json')] = `COMBINATIONS`;
      files[Path.join('CWD', 'input')] = true;
      files[Path.join('CWD', 'input', 'file.txt')] = 'FILE %FACTOR-a%';

      const combinations = await task.generate();
      expect(combinations).toEqual([{ a: 0 }, { a: 1 }]);

      expect(files[Path.join('CWD', 'combinations')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_0')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_0', 'input')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_0', 'input', 'file.txt')]).toEqual('FILE 0');
      expect(files[Path.join('CWD', 'combinations', 'combination_0', 'generated')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_0', 'output')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_0', 'jbr-experiment.json')]).toEqual(`TEMPLATE 0`);
      expect(files[Path.join('CWD', 'combinations', 'combination_1')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_1', 'input')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_1', 'input', 'file.txt')]).toEqual('FILE 1');
      expect(files[Path.join('CWD', 'combinations', 'combination_1', 'generated')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_1', 'output')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_1', 'jbr-experiment.json')]).toEqual(`TEMPLATE 1`);

      expect(symlinks[Path.join('CWD', 'combinations', 'combination_0', 'output')])
        .toEqual(Path.join('CWD', 'output', 'combination_0'));
      expect(symlinks[Path.join('CWD', 'combinations', 'combination_1', 'output')])
        .toEqual(Path.join('CWD', 'output', 'combination_1'));

      expect(experimentLoader.instantiateExperiments).toHaveBeenCalledWith('CWD');
    });

    it('throws on an invalid combinations experiment', async() => {
      await expect(task.generate()).rejects
        .toThrowError(`A combinations-based experiments requires the files 'jbr-experiment.json.template' and 'jbr-combinations.json'.`);
    });

    it('regenerates combinations when the files already exists', async() => {
      files[Path.join('CWD', 'jbr-experiment.json.template')] = `TEMPLATE %FACTOR-a%`;
      files[Path.join('CWD', 'jbr-combinations.json')] = `COMBINATIONS`;
      files[Path.join('CWD', 'input')] = true;
      files[Path.join('CWD', 'input', 'file.txt')] = 'FILE %FACTOR-a%';
      files[Path.join('CWD', 'combinations')] = true;
      files[Path.join('CWD', 'combinations', 'combination_0')] = true;
      files[Path.join('CWD', 'combinations', 'combination_0', 'input')] = true;
      files[Path.join('CWD', 'combinations', 'combination_0', 'input', 'file.txt')] = 'will be overridden';
      files[Path.join('CWD', 'combinations', 'combination_0', 'generated')] = true;
      files[Path.join('CWD', 'combinations', 'combination_0', 'output')] = true;
      files[Path.join('CWD', 'combinations', 'combination_0', 'jbr-experiment.json')] = 'will be overridden';
      files[Path.join('CWD', 'combinations', 'combination_1')] = true;
      files[Path.join('CWD', 'combinations', 'combination_1', 'input')] = true;
      files[Path.join('CWD', 'combinations', 'combination_1', 'input', 'file.txt')] = 'will be overridden';
      files[Path.join('CWD', 'combinations', 'combination_1', 'generated')] = true;
      files[Path.join('CWD', 'combinations', 'combination_1', 'output')] = true;
      files[Path.join('CWD', 'combinations', 'combination_1', 'jbr-experiment.json')] = 'will be overridden';

      files[Path.join('CWD', 'output', 'combination_0')] = true;
      files[Path.join('CWD', 'output', 'combination_1')] = true;

      const combinations = await task.generate();
      expect(combinations).toEqual([{ a: 0 }, { a: 1 }]);

      expect(files[Path.join('CWD', 'combinations')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_0')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_0', 'input')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_0', 'input', 'file.txt')]).toEqual('FILE 0');
      expect(files[Path.join('CWD', 'combinations', 'combination_0', 'generated')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_0', 'output')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_0', 'jbr-experiment.json')]).toEqual(`TEMPLATE 0`);
      expect(files[Path.join('CWD', 'combinations', 'combination_1')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_1', 'input')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_1', 'input', 'file.txt')]).toEqual('FILE 1');
      expect(files[Path.join('CWD', 'combinations', 'combination_1', 'generated')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_1', 'output')]).toEqual(true);
      expect(files[Path.join('CWD', 'combinations', 'combination_1', 'jbr-experiment.json')]).toEqual(`TEMPLATE 1`);

      expect(symlinks[Path.join('CWD', 'combinations', 'combination_0', 'output')])
        .toEqual(Path.join('CWD', 'output', 'combination_0'));
      expect(symlinks[Path.join('CWD', 'combinations', 'combination_1', 'output')])
        .toEqual(Path.join('CWD', 'output', 'combination_1'));

      expect(experimentLoader.instantiateExperiments).toHaveBeenCalledWith('CWD');
    });
  });

  describe('applyFactorCombination', () => {
    it('should handle the experiment id', () => {
      expect(TaskGenerateCombinations.applyFactorCombination({}, 'EXP', 'COMB', `ABC urn:jrb:EXP  urn:jrb:EXP`))
        .toEqual(`ABC urn:jrb:EXP:COMB  urn:jrb:EXP:COMB`);
    });

    it('should handle an empty combination', () => {
      expect(TaskGenerateCombinations.applyFactorCombination({}, 'EXP', 'COMB', `ABC`))
        .toEqual(`ABC`);
    });

    it('should handle a single combination entry', () => {
      expect(TaskGenerateCombinations.applyFactorCombination({ key1: 'a' }, 'EXP', 'COMB', `ABC: %FACTOR-key1%`))
        .toEqual(`ABC: a`);
    });

    it('should handle multiple occurrences of a single combination entry', () => {
      expect(TaskGenerateCombinations.applyFactorCombination({ key1: 'a' }, 'EXP', 'COMB', `ABC: %FACTOR-key1% %FACTOR-key1% %FACTOR-key1%`))
        .toEqual(`ABC: a a a`);
    });

    it('should handle multiple occurrences of a multiple combination entries', () => {
      const combination = {
        key1: 'a',
        key2: 'b',
        key3: 'c',
      };
      expect(TaskGenerateCombinations.applyFactorCombination(combination, 'EXP', 'COMB', `
A: %FACTOR-key1% %FACTOR-key1%
B: %FACTOR-key2% %FACTOR-key2%
C: %FACTOR-key3% %FACTOR-key3%
`))
        .toEqual(`
A: a a
B: b b
C: c c
`);
    });
  });

  describe('copyFiles', () => {
    it('should handle an empty directory', async() => {
      files['source/'] = true;

      await TaskGenerateCombinations.copyFiles('source', 'dest', (a: string) => a);

      expect(files).toEqual({
        'source/': true,
        'dest/': true,
      });
    });

    it('should handle files in a directory', async() => {
      files['source/'] = true;
      files['source/a.txt'] = 'aaa';
      files['source/b.txt'] = 'bbb';

      await TaskGenerateCombinations.copyFiles('source', 'dest', (a: string) => a);

      expect(files).toEqual({
        'source/': true,
        'source/a.txt': 'aaa',
        'source/b.txt': 'bbb',
        'dest/': true,
        'dest/a.txt': 'aaa',
        'dest/b.txt': 'bbb',
      });
    });

    it('should handle nested files in a directory', async() => {
      files['source/'] = true;
      files['source/a/'] = true;
      files['source/a/a.txt'] = 'aaa';
      files['source/b/'] = true;
      files['source/b/b.txt'] = 'bbb';

      await TaskGenerateCombinations.copyFiles('source', 'dest', (a: string) => a);

      expect(files).toEqual({
        'source/': true,
        'source/a/': true,
        'source/a/a.txt': 'aaa',
        'source/b/': true,
        'source/b/b.txt': 'bbb',
        'dest/': true,
        'dest/a/': true,
        'dest/a/a.txt': 'aaa',
        'dest/b/': true,
        'dest/b/b.txt': 'bbb',
      });
    });

    it('should ignore invalid files', async() => {
      files['source/'] = true;
      files['source/a.txt'] = 'aaa';
      files['source/b.txt'] = 'bbb';
      files['source/b%/'] = 'bbb';

      await TaskGenerateCombinations.copyFiles('source', 'dest', (a: string) => a);

      expect(files).toEqual({
        'source/': true,
        'source/a.txt': 'aaa',
        'source/b.txt': 'bbb',
        'source/b%/': 'bbb',
        'dest/': true,
        'dest/a.txt': 'aaa',
        'dest/b.txt': 'bbb',
      });
    });
  });
});
