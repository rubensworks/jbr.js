import Path from 'node:path';
import { HdtConverter, createExperimentPaths } from 'jbr';
import type { Hook, ITaskContext, ProcessHandler } from 'jbr';
import { TestLogger } from '../../jbr/test/TestLogger';
import { ExperimentBsbm } from '../lib/ExperimentBsbm';

let files: Record<string, boolean | string> = {
  'CWD/generated/single.xml': '',
};
let filesOut: Record<string, boolean | string> = {};
let dirsOut: Record<string, boolean | string> = {};
jest.mock<any>('fs-extra', () => ({
  ...jest.requireActual('fs-extra'),
  async pathExists(path: string) {
    return path in files;
  },
  async mkdir(dirPath: string) {
    dirsOut[dirPath] = true;
  },
  createWriteStream: jest.fn((path: string) => {
    filesOut[path] = true;
  }),
  readFile: jest.fn((path: string) => {
    return filesOut[path];
  }),
  async ensureDir(dirPath: string) {
    dirsOut[dirPath] = true;
  },
  async move() {
    // No-op
  },
  async writeFile(path: string) {
    filesOut[path] = true;
  },
}));

describe('ExperimentBsbm', () => {
  let context: ITaskContext;
  let hookSparqlEndpoint: Hook;
  let endpointHandlerStopCollectingStats: any;
  let endpointHandler: ProcessHandler;
  let experiment: ExperimentBsbm;

  function createUpdateExperiment(endpointUpdateUrl?: string, updateTransactions?: number): ExperimentBsbm {
    return new ExperimentBsbm(
      100,
      false,
      hookSparqlEndpoint,
      'http://localhost:3000/sparql',
      'http://localhost:3001/sparql',
      10,
      10,
      undefined,
      'exploreAndUpdate',
      endpointUpdateUrl,
      updateTransactions,
    );
  }
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
      docker: <any> {
        containerCreator: <any> {
          start: jest.fn(async() => endpointHandler),
        },
        imagePuller: {
          pull: jest.fn(),
        },
        imageBuilder: {
          getImageName: jest.fn(),
        },
        networkCreator: {
          create: jest.fn(() => ({ network: { id: 'network-id' }, close: jest.fn() })),
          remove: jest.fn(),
        },
        networkInspector: {
          async inspect(_id: string) {
            return {
              Name: 'bridge',
              IPAM: {
                Config: [
                  {
                    Subnet: '172.17.0.0/16',
                    Gateway: '172.17.0.10',
                  },
                ],
              },
            };
          },
        },
      },
    };
    endpointHandlerStopCollectingStats = jest.fn(() => {
      filesOut[Path.join(context.experimentPaths.generated, 'single.xml')] = 'SINGLE.XML';
    });
    endpointHandler = {
      close: jest.fn(),
      startCollectingStats: jest.fn(() => endpointHandlerStopCollectingStats),
      join: jest.fn(),
      addTerminationHandler: jest.fn(),
      removeTerminationHandler: jest.fn(),
    };
    hookSparqlEndpoint = <any> {
      prepare: jest.fn(),
      start: jest.fn(() => endpointHandler),
      clean: jest.fn(),
    };
    experiment = new ExperimentBsbm(
      100,
      true,
      hookSparqlEndpoint,
      'http://localhost:3000/sparql',
      'http://localhost:3001/sparql',
      10,
      50,
      undefined,
    );
    files = {};
    dirsOut = {};
    filesOut = {};
    jest.spyOn(<any> process, 'on').mockImplementation();
  });

  describe('constructed', () => {
    it('on mac', async() => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });
      experiment = new ExperimentBsbm(
        100,
        true,
        hookSparqlEndpoint,
        'http://host.docker.internal:3000/sparql',
        'http://localhost:3001/sparql',
        10,
        50,
        undefined,
      );
      await expect(experiment.getEndpointUrl(context)).resolves.toBe('http://host.docker.internal:3000/sparql');
    });

    it('on linux', async() => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });
      experiment = new ExperimentBsbm(
        100,
        true,
        hookSparqlEndpoint,
        'http://host.docker.internal:3000/sparql',
        'http://localhost:3001/sparql',
        10,
        50,
        undefined,
      );
      await expect(experiment.getEndpointUrl(context)).resolves.toBe('http://172.17.0.10:3000/sparql');
    });

    it('on linux when inspector fails', async() => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });
      experiment = new ExperimentBsbm(
        100,
        true,
        hookSparqlEndpoint,
        'http://host.docker.internal:3000/sparql',
        'http://localhost:3001/sparql',
        10,
        50,
        undefined,
      );
      context.docker.networkInspector = <any> {
        inspect: () => Promise.reject(new Error('fail')),
      };
      await expect(experiment.getEndpointUrl(context)).resolves.toBe('http://172.17.0.1:3000/sparql');
    });

    it('with the explore use case by default', () => {
      expect(experiment.useCase).toBe('explore');
      expect(experiment.updates).toBe(false);
      expect(experiment.endpointUpdateUrlRaw).toBe('http://localhost:3000/sparql');
      expect(experiment.updateTransactions).toBe(100);
    });

    it('with the exploreAndUpdate use case', () => {
      experiment = createUpdateExperiment();
      expect(experiment.useCase).toBe('exploreAndUpdate');
      expect(experiment.updates).toBe(true);
      expect(experiment.endpointUpdateUrlRaw).toBe('http://localhost:3000/sparql');
      expect(experiment.updateTransactions).toBe(20);
    });

    it('with the exploreAndUpdate use case and a separate update endpoint', async() => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });
      experiment = createUpdateExperiment('http://host.docker.internal:3002/update', 30);
      expect(experiment.updateTransactions).toBe(30);
      await expect(experiment.getEndpointUpdateUrl(context)).resolves.toBe('http://172.17.0.10:3002/update');
    });

    it('throws on an invalid use case', () => {
      expect(() => new ExperimentBsbm(
        100,
        true,
        hookSparqlEndpoint,
        'http://localhost:3000/sparql',
        'http://localhost:3001/sparql',
        10,
        10,
        undefined,
        'businessIntelligence',
      )).toThrow(`Invalid BSBM use case 'businessIntelligence', must be one of explore, exploreAndUpdate`);
    });

    it('throws on updateTransactions that are not below the product count', () => {
      expect(() => createUpdateExperiment(undefined, 100))
        .toThrow(`Invalid BSBM updateTransactions 100, must be an integer below the productCount 100`);
    });

    it('throws on updateTransactions that are not an integer', () => {
      expect(() => createUpdateExperiment(undefined, 20.5))
        .toThrow(`Invalid BSBM updateTransactions 20.5, must be an integer below the productCount 100`);
    });

    it('throws on updateTransactions that are too few for all runs', () => {
      expect(() => createUpdateExperiment(undefined, 19))
        .toThrow(`Invalid BSBM updateTransactions 19, must be at least 20 for 10 runs`);
    });

    it('does not validate updateTransactions without updates', () => {
      expect(() => new ExperimentBsbm(
        100,
        true,
        hookSparqlEndpoint,
        'http://localhost:3000/sparql',
        'http://localhost:3001/sparql',
        10,
        50,
        undefined,
        'explore',
        undefined,
        1_000,
      )).not.toThrow();
    });
  });

  describe('prepare', () => {
    it('should prepare the experiment', async() => {
      await experiment.prepare(context, false);

      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context, false);

      expect(context.docker.imagePuller.pull).toHaveBeenCalledTimes(2);
      expect(context.docker.imagePuller.pull).toHaveBeenCalledWith({
        repoTag: ExperimentBsbm.DOCKER_IMAGE_BSBM,
      });
      expect(context.docker.imagePuller.pull).toHaveBeenCalledWith({
        repoTag: HdtConverter.DOCKER_IMAGE_HDT,
      });

      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(3);
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentBsbm.DOCKER_IMAGE_BSBM,
        cmdArgs: [
          'generate',
          '-dir',
          '/data/td_data',
          '-pc',
          '100',
          '-fc',
        ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/data`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'bsbm-generation.txt'),
      });
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: HdtConverter.DOCKER_IMAGE_HDT,
        cmdArgs: [ 'rdf2hdt', '/output/dataset.nt', '/output/dataset.hdt' ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'bsbm-hdt.txt'),
      });
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: HdtConverter.DOCKER_IMAGE_HDT,
        cmdArgs: [ 'hdtSearch', '/output/dataset.hdt', '-q', '0' ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'bsbm-hdt-index.txt'),
      });

      expect(dirsOut).toEqual({
        'CWD/output/logs': true,
      });
    });

    it('should prepare the experiment if files already exist', async() => {
      files[Path.join(context.experimentPaths.generated, 'dataset.nt')] = true;
      files[Path.join(context.experimentPaths.generated, 'dataset.hdt')] = true;

      await experiment.prepare(context, false);

      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context, false);

      expect(context.docker.imagePuller.pull).toHaveBeenCalledTimes(0);

      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(0);

      expect(dirsOut).toEqual({
        'CWD/output/logs': true,
      });
    });

    it('should forcefully prepare the experiment', async() => {
      await experiment.prepare(context, true);

      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context, true);

      expect(context.docker.imagePuller.pull).toHaveBeenCalledTimes(2);
      expect(context.docker.imagePuller.pull).toHaveBeenCalledWith({
        repoTag: ExperimentBsbm.DOCKER_IMAGE_BSBM,
      });
      expect(context.docker.imagePuller.pull).toHaveBeenCalledWith({
        repoTag: HdtConverter.DOCKER_IMAGE_HDT,
      });

      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(3);
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentBsbm.DOCKER_IMAGE_BSBM,
        cmdArgs: [
          'generate',
          '-dir',
          '/data/td_data',
          '-pc',
          '100',
          '-fc',
        ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/data`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'bsbm-generation.txt'),
      });
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: HdtConverter.DOCKER_IMAGE_HDT,
        cmdArgs: [ 'rdf2hdt', '/output/dataset.nt', '/output/dataset.hdt' ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'bsbm-hdt.txt'),
      });
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: HdtConverter.DOCKER_IMAGE_HDT,
        cmdArgs: [ 'hdtSearch', '/output/dataset.hdt', '-q', '0' ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'bsbm-hdt-index.txt'),
      });

      expect(dirsOut).toEqual({
        'CWD/output/logs': true,
      });
    });

    it('should forcefully prepare the experiment if files already exist', async() => {
      files[Path.join(context.experimentPaths.generated, 'dataset.nt')] = true;
      files[Path.join(context.experimentPaths.generated, 'dataset.hdt')] = true;

      await experiment.prepare(context, true);

      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context, true);

      expect(context.docker.imagePuller.pull).toHaveBeenCalledTimes(2);
      expect(context.docker.imagePuller.pull).toHaveBeenCalledWith({
        repoTag: ExperimentBsbm.DOCKER_IMAGE_BSBM,
      });
      expect(context.docker.imagePuller.pull).toHaveBeenCalledWith({
        repoTag: HdtConverter.DOCKER_IMAGE_HDT,
      });

      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(3);
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentBsbm.DOCKER_IMAGE_BSBM,
        cmdArgs: [
          'generate',
          '-dir',
          '/data/td_data',
          '-pc',
          '100',
          '-fc',
        ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/data`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'bsbm-generation.txt'),
      });
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: HdtConverter.DOCKER_IMAGE_HDT,
        cmdArgs: [ 'rdf2hdt', '/output/dataset.nt', '/output/dataset.hdt' ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'bsbm-hdt.txt'),
      });
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: HdtConverter.DOCKER_IMAGE_HDT,
        cmdArgs: [ 'hdtSearch', '/output/dataset.hdt', '-q', '0' ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'bsbm-hdt-index.txt'),
      });

      expect(dirsOut).toEqual({
        'CWD/output/logs': true,
      });
    });

    it('should prepare the experiment without HDT', async() => {
      experiment = new ExperimentBsbm(
        100,
        false,
        hookSparqlEndpoint,
        'http://localhost:3000/sparql',
        'http://localhost:3001/sparql',
        10,
        50,
        undefined,
      );

      await experiment.prepare(context, false);

      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context, false);

      expect(context.docker.imagePuller.pull).toHaveBeenCalledTimes(1);
      expect(context.docker.imagePuller.pull).toHaveBeenCalledWith({
        repoTag: ExperimentBsbm.DOCKER_IMAGE_BSBM,
      });

      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(1);
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentBsbm.DOCKER_IMAGE_BSBM,
        cmdArgs: [
          'generate',
          '-dir',
          '/data/td_data',
          '-pc',
          '100',
          '-fc',
        ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/data`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'bsbm-generation.txt'),
      });

      expect(dirsOut).toEqual({
        'CWD/output/logs': true,
      });
    });
  });

  describe('prepare with updates', () => {
    beforeEach(() => {
      experiment = createUpdateExperiment();
    });

    it('should generate the dataset and the update dataset', async() => {
      await experiment.prepare(context, false);

      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(1);
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentBsbm.DOCKER_IMAGE_BSBM,
        cmdArgs: [
          'generate',
          '-dir',
          '/data/td_data',
          '-pc',
          '100',
          '-fc',
          '-ud',
          '-tc',
          '20',
        ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/data`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'bsbm-generation.txt'),
      });
    });

    it('should generate the datasets if only the dataset exists', async() => {
      files[Path.join(context.experimentPaths.generated, 'dataset.nt')] = true;

      await experiment.prepare(context, false);

      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(1);
    });

    it('should skip generation if both datasets exist', async() => {
      files[Path.join(context.experimentPaths.generated, 'dataset.nt')] = true;
      files[Path.join(context.experimentPaths.generated, 'dataset_update.nt')] = true;

      await experiment.prepare(context, false);

      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(0);
    });
  });

  describe('run', () => {
    beforeEach(() => {
      experiment.httpAvailabilityLatch.sleepUntilAvailable = () => Promise.resolve();
    });

    it('should run the experiment', async() => {
      await experiment.run(context);

      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(context);
      expect(endpointHandler.startCollectingStats).toHaveBeenCalledWith();
      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(1);
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentBsbm.DOCKER_IMAGE_BSBM,
        cmdArgs: [
          'testdriver',
          '-idir',
          '/data/td_data',
          '-seed',
          '9834533',
          '-o',
          'single.xml',
          '-w',
          '10',
          '-runs',
          '50',
          'http://localhost:3000/sparql',
        ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/data`,
          ],
          NetworkMode: 'network-id',
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'bsbm-run.txt'),
      });
      expect(endpointHandler.close).toHaveBeenCalledWith();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalledWith();

      expect(dirsOut).toEqual({});
    });

    it('should pass the query timeout to the test driver', async() => {
      experiment = new ExperimentBsbm(
        100,
        true,
        hookSparqlEndpoint,
        'http://localhost:3000/sparql',
        'http://localhost:3001/sparql',
        10,
        50,
        300_000,
      );
      experiment.httpAvailabilityLatch.sleepUntilAvailable = () => Promise.resolve();

      await experiment.run(context);

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith(expect.objectContaining({
        cmdArgs: [
          'testdriver',
          '-idir',
          '/data/td_data',
          '-seed',
          '9834533',
          '-o',
          'single.xml',
          '-w',
          '10',
          '-runs',
          '50',
          '-t',
          '300000',
          'http://localhost:3000/sparql',
        ],
      }));
    });

    it('should not log the run logs if a valid output file was generated', async() => {
      files[Path.join(context.experimentPaths.generated, 'single.xml')] = true;

      await experiment.run(context);

      expect(context.logger.info).not.toHaveBeenCalledWith(`No valid BSBM output file was generated.`);
      expect(context.logger.error).not.toHaveBeenCalled();
    });

    it('should run the experiment with breakpoint', async() => {
      let breakpointBarrierResolver: any;
      const breakpointBarrier: any = () => new Promise((resolve) => {
        breakpointBarrierResolver = resolve;
      });
      const experimentEnd = experiment.run({ ...context, breakpointBarrier });

      await new Promise(setImmediate);

      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith({ ...context, breakpointBarrier });
      expect(endpointHandler.startCollectingStats).not.toHaveBeenCalled();
      expect(context.docker.containerCreator.start).not.toHaveBeenCalled();
      expect(endpointHandler.close).not.toHaveBeenCalled();
      expect(endpointHandlerStopCollectingStats).not.toHaveBeenCalled();

      breakpointBarrierResolver();
      await experimentEnd;

      expect(endpointHandler.startCollectingStats).toHaveBeenCalledWith();
      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(1);
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentBsbm.DOCKER_IMAGE_BSBM,
        cmdArgs: [
          'testdriver',
          '-idir',
          '/data/td_data',
          '-seed',
          '9834533',
          '-o',
          'single.xml',
          '-w',
          '10',
          '-runs',
          '50',
          'http://localhost:3000/sparql',
        ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/data`,
          ],
          NetworkMode: 'network-id',
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'bsbm-run.txt'),
      });
      expect(endpointHandler.close).toHaveBeenCalledWith();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalledWith();

      expect(dirsOut).toEqual({});
    });

    it('should gracefully close services on SIGINT', async() => {
      jest.spyOn(<any> process, 'on').mockImplementation((event, cb) => {
        if (event === 'SIGINT') {
          (<() => void> cb)();
        }
      });

      await experiment.run(context);

      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(context);
      expect(endpointHandler.close).toHaveBeenCalledWith();
    });
  });

  describe('run with updates', () => {
    beforeEach(() => {
      experiment = createUpdateExperiment('http://localhost:3002/update');
      experiment.httpAvailabilityLatch.sleepUntilAvailable = () => Promise.resolve();
    });

    it('should run the experiment', async() => {
      filesOut[Path.join(context.experimentPaths.generated, 'dataset_update.nt')] =
        '<a> <b> <c> .\n#__SEP__\n'.repeat(20);

      await experiment.run(context);

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith(expect.objectContaining({
        cmdArgs: [
          'testdriver',
          '-idir',
          '/data/td_data',
          '-seed',
          '9834533',
          '-o',
          'single.xml',
          '-w',
          '10',
          '-runs',
          '10',
          '-ucf',
          'usecases/exploreAndUpdate/sparql.txt',
          '-u',
          'http://localhost:3002/update',
          '-udataset',
          '/data/dataset_update.nt',
          'http://localhost:3000/sparql',
        ],
      }));
    });

    it('should throw if the update dataset has too few transactions', async() => {
      filesOut[Path.join(context.experimentPaths.generated, 'dataset_update.nt')] =
        '<a> <b> <c> .\n#__SEP__\n'.repeat(19);

      await expect(experiment.run(context)).rejects.toThrow(`The BSBM update dataset contains 19 transactions, while 20 are required for 10 runs. Prepare the experiment again with 'jbr prepare -f'.`);

      expect(hookSparqlEndpoint.start).not.toHaveBeenCalled();
      expect(context.docker.containerCreator.start).not.toHaveBeenCalled();
    });
  });

  describe('clean', () => {
    it('should clean without targets', async() => {
      await experiment.clean(context, {});

      expect(hookSparqlEndpoint.clean).toHaveBeenCalledWith(context, {});
    });

    it('should clean with targets', async() => {
      await experiment.clean(context, { docker: true });

      expect(hookSparqlEndpoint.clean).toHaveBeenCalledWith(context, { docker: true });
      expect(context.docker.networkCreator.remove).toHaveBeenCalledWith(<any> undefined);
    });
  });
});
