import * as Path from 'path';
import * as tar from 'tar';
import { createExperimentPaths } from '../../lib/cli/CliHelpers';
import type { ExperimentLoader } from '../../lib/task/ExperimentLoader';
import { TaskPack } from '../../lib/task/TaskPack';
import { TestLogger } from '../TestLogger';

let experimentLoader: ExperimentLoader;
jest.mock('../../lib/task/ExperimentLoader', () => ({
  ExperimentLoader: {
    ...jest.requireActual('../../lib/task/ExperimentLoader').ExperimentLoader,
    build: jest.fn(() => experimentLoader),
    getDefaultExperimentIri: () => 'IRI',
  },
}));

jest.mock('tar');

describe('TaskPack', () => {
  let task: TaskPack;
  beforeEach(() => {
    task = new TaskPack(
      {
        cwd: 'CWD',
        experimentPaths: createExperimentPaths('CWD'),
        mainModulePath: 'MMP',
        verbose: true,
        closeExperiment: jest.fn(),
        cleanupHandlers: [],
        logger: <any> new TestLogger(),
        docker: <any>{},
      },
      'bla.tar.gz',
    );
  });

  describe('for a single combination', () => {
    beforeEach(() => {
      const experimentPathsArray = [
        createExperimentPaths('CWD'),
      ];
      experimentLoader = <any> {
        instantiateExperiments: jest.fn(() => ({ experimentPathsArray })),
      };
    });

    describe('pack', () => {
      it('packs the output directory', async() => {
        await task.pack();
        expect(tar.create).toHaveBeenCalledWith({
          cwd: 'CWD',
          file: 'bla.tar.gz',
          gzip: true,
        }, [
          'output',
        ]);
      });
    });
  });

  describe('for a single combination with default name', () => {
    describe('pack', () => {
      it('packs the output directory', async() => {
        task = new TaskPack(
          {
            cwd: 'CWD',
            experimentPaths: createExperimentPaths('CWD'),
            mainModulePath: 'MMP',
            verbose: true,
            closeExperiment: jest.fn(),
            cleanupHandlers: [],
            logger: <any> new TestLogger(),
            docker: <any> {},
          },
        );

        await task.pack();
        expect(tar.create).toHaveBeenCalledWith({
          cwd: 'CWD',
          file: 'jbr-CWD-output.tar.gz',
          gzip: true,
        }, [
          'output',
        ]);
      });
    });
  });

  describe('for two combinations', () => {
    beforeEach(() => {
      const experimentPathsArray = [
        createExperimentPaths(Path.join('CWD', 'PATH1')),
        createExperimentPaths(Path.join('CWD', 'PATH2')),
      ];
      experimentLoader = <any> {
        instantiateExperiments: jest.fn(() => ({ experimentPathsArray })),
      };
    });

    describe('pack', () => {
      it('packs the output directories', async() => {
        await task.pack();
        expect(tar.create).toHaveBeenCalledWith({
          cwd: 'CWD',
          file: 'bla.tar.gz',
          gzip: true,
        }, [
          Path.join('PATH1', 'output'),
          Path.join('PATH2', 'output'),
        ]);
      });
    });
  });

  describe('for invalid combination paths', () => {
    beforeEach(() => {
      const experimentPathsArray = [
        createExperimentPaths(Path.join('OTHER', 'PATH1')),
        createExperimentPaths(Path.join('OTHER', 'PATH2')),
      ];
      experimentLoader = <any> {
        instantiateExperiments: jest.fn(() => ({ experimentPathsArray })),
      };
    });

    describe('pack', () => {
      it('packs the output directories', async() => {
        await expect(task.pack()).rejects.toThrowError(`Illegal experiment output path '${Path.join('OTHER', 'PATH1', 'output')}' outside of cwd scope 'CWD'`);
      });
    });
  });
});
