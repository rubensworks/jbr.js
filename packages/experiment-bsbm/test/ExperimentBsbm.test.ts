import Path from 'path';
import { HdtConverter, createExperimentPaths } from 'jbr';
import type { DockerNetworkInspector, Hook, ITaskContext, ProcessHandler } from 'jbr';
import { TestLogger } from '../../jbr/test/TestLogger';
import { ExperimentBsbm } from '../lib/ExperimentBsbm';

let files: Record<string, boolean | string> = {
  'CWD/generated/single.xml': '',
};
let filesOut: Record<string, boolean | string> = {};
let dirsOut: Record<string, boolean | string> = {};
jest.mock('fs-extra', () => ({
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
  let inspector: DockerNetworkInspector;
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
          async inspect(id: string) {
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
    );
    files = {};
    dirsOut = {};
    filesOut = {};
    (<any> process).on = jest.fn();
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
      );
      expect(await experiment.getEndpointUrl(context)).toEqual('http://host.docker.internal:3000/sparql');
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
      );
      expect(await experiment.getEndpointUrl(context)).toEqual('http://172.17.0.10:3000/sparql');
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
      );
      context.docker.networkInspector = <any> {
        inspect: () => Promise.reject(new Error('fail')),
      };
      expect(await experiment.getEndpointUrl(context)).toEqual('http://172.17.0.1:3000/sparql');
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

  describe('run', () => {
    beforeEach(() => {
      experiment.httpAvailabilityLatch.sleepUntilAvailable = () => Promise.resolve();
    });

    it('should run the experiment', async() => {
      await experiment.run(context);

      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(context);
      expect(endpointHandler.startCollectingStats).toHaveBeenCalled();
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
      expect(endpointHandler.close).toHaveBeenCalled();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalled();

      expect(dirsOut).toEqual({});
    });

    it('should run the experiment with breakpoint', async() => {
      let breakpointBarrierResolver: any;
      const breakpointBarrier: any = () => new Promise(resolve => {
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

      expect(endpointHandler.startCollectingStats).toHaveBeenCalled();
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
      expect(endpointHandler.close).toHaveBeenCalled();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalled();

      expect(dirsOut).toEqual({});
    });

    it('should gracefully close services on SIGINT', async() => {
      (<any> process).on = jest.fn((event, cb) => {
        if (event === 'SIGINT') {
          cb();
        }
      });

      await experiment.run(context);

      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(context);
      expect(endpointHandler.close).toHaveBeenCalled();
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
