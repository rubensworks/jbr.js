import Path from 'path';
import type { Hook, ITaskContext, ProcessHandler } from 'jbr';
import { createExperimentPaths } from 'jbr';
import { writeBenchmarkResults } from 'sparql-benchmark-runner';
import { TestLogger } from '../../jbr/test/TestLogger';
import { ExperimentWatDiv } from '../lib/ExperimentWatDiv';

let sparqlBenchmarkRun: any;
jest.mock('sparql-benchmark-runner', () => ({
  SparqlBenchmarkRunner: jest.fn().mockImplementation((options: any) => {
    options.logger('Test logger');
    return {
      run: sparqlBenchmarkRun,
    };
  }),
  readQueries: jest.fn(),
  writeBenchmarkResults: jest.fn(),
}));

let files: Record<string, boolean | string> = {};
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
  async ensureDir(dirPath: string) {
    dirsOut[dirPath] = true;
  },
}));

describe('ExperimentWatDiv', () => {
  let context: ITaskContext;
  let hookSparqlEndpoint: Hook;
  let endpointHandlerStopCollectingStats: any;
  let endpointHandler: ProcessHandler;
  let experiment: ExperimentWatDiv;
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
      },
    };
    endpointHandlerStopCollectingStats = jest.fn();
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
    sparqlBenchmarkRun = jest.fn(async({ onStart, onStop }) => {
      await onStart();
      await onStop();
    });
    experiment = new ExperimentWatDiv(
      1,
      5,
      1,
      true,
      hookSparqlEndpoint,
      'http://localhost:3001/sparql',
      3,
      1,
      true,
      true,
      {},
      {},
      600,
    );
    files = {};
    dirsOut = {};
    filesOut = {};
    (<any> process).on = jest.fn();
  });

  describe('prepare', () => {
    it('should prepare the experiment', async() => {
      await experiment.prepare(context, false);

      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context, false);

      expect(context.docker.imagePuller.pull).toHaveBeenCalledTimes(2);
      expect(context.docker.imagePuller.pull).toHaveBeenCalledWith({
        repoTag: ExperimentWatDiv.DOCKER_IMAGE_WATDIV,
      });
      expect(context.docker.imagePuller.pull).toHaveBeenCalledWith({
        repoTag: ExperimentWatDiv.DOCKER_IMAGE_HDT,
      });

      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(3);
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentWatDiv.DOCKER_IMAGE_WATDIV,
        cmdArgs: [ '-s', '1', '-q', '5', '-r', '1' ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'watdiv-generation.txt'),
      });
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentWatDiv.DOCKER_IMAGE_HDT,
        cmdArgs: [ 'rdf2hdt', '/output/dataset.nt', '/output/dataset.hdt' ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'watdiv-hdt.txt'),
      });
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentWatDiv.DOCKER_IMAGE_HDT,
        cmdArgs: [ 'hdtSearch', '/output/dataset.hdt', '-q', '0' ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'watdiv-hdt-index.txt'),
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
        repoTag: ExperimentWatDiv.DOCKER_IMAGE_WATDIV,
      });
      expect(context.docker.imagePuller.pull).toHaveBeenCalledWith({
        repoTag: ExperimentWatDiv.DOCKER_IMAGE_HDT,
      });

      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(3);
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentWatDiv.DOCKER_IMAGE_WATDIV,
        cmdArgs: [ '-s', '1', '-q', '5', '-r', '1' ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'watdiv-generation.txt'),
      });
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentWatDiv.DOCKER_IMAGE_HDT,
        cmdArgs: [ 'rdf2hdt', '/output/dataset.nt', '/output/dataset.hdt' ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'watdiv-hdt.txt'),
      });
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentWatDiv.DOCKER_IMAGE_HDT,
        cmdArgs: [ 'hdtSearch', '/output/dataset.hdt', '-q', '0' ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'watdiv-hdt-index.txt'),
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
        repoTag: ExperimentWatDiv.DOCKER_IMAGE_WATDIV,
      });
      expect(context.docker.imagePuller.pull).toHaveBeenCalledWith({
        repoTag: ExperimentWatDiv.DOCKER_IMAGE_HDT,
      });

      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(3);
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentWatDiv.DOCKER_IMAGE_WATDIV,
        cmdArgs: [ '-s', '1', '-q', '5', '-r', '1' ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'watdiv-generation.txt'),
      });
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentWatDiv.DOCKER_IMAGE_HDT,
        cmdArgs: [ 'rdf2hdt', '/output/dataset.nt', '/output/dataset.hdt' ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'watdiv-hdt.txt'),
      });
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentWatDiv.DOCKER_IMAGE_HDT,
        cmdArgs: [ 'hdtSearch', '/output/dataset.hdt', '-q', '0' ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'watdiv-hdt-index.txt'),
      });

      expect(dirsOut).toEqual({
        'CWD/output/logs': true,
      });
    });

    it('should prepare the experiment without HDT', async() => {
      experiment = new ExperimentWatDiv(
        1,
        5,
        1,
        false,
        hookSparqlEndpoint,
        'http://localhost:3001/sparql',
        3,
        1,
        true,
        true,
        {},
        {},
        600,
      );

      await experiment.prepare(context, false);

      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context, false);

      expect(context.docker.imagePuller.pull).toHaveBeenCalledTimes(1);
      expect(context.docker.imagePuller.pull).toHaveBeenCalledWith({
        repoTag: ExperimentWatDiv.DOCKER_IMAGE_WATDIV,
      });

      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(1);
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: ExperimentWatDiv.DOCKER_IMAGE_WATDIV,
        cmdArgs: [ '-s', '1', '-q', '5', '-r', '1' ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'watdiv-generation.txt'),
      });

      expect(dirsOut).toEqual({
        'CWD/output/logs': true,
      });
    });
  });

  describe('run', () => {
    it('should run the experiment', async() => {
      await experiment.run(context);

      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(context);
      expect(endpointHandler.startCollectingStats).toHaveBeenCalled();
      expect(sparqlBenchmarkRun).toHaveBeenCalled();
      expect(endpointHandler.close).toHaveBeenCalled();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalled();
      expect(writeBenchmarkResults).toHaveBeenCalledWith(
        undefined,
        Path.normalize('CWD/output/query-times.csv'),
        true,
        [ 'httpRequests' ],
      );

      expect(dirsOut).toEqual({
        'CWD/output': true,
      });
    });

    it('should run the experiment without recording http requests', async() => {
      experiment = new ExperimentWatDiv(
        1,
        5,
        1,
        true,
        hookSparqlEndpoint,
        'http://localhost:3001/sparql',
        3,
        1,
        true,
        false,
        {},
        {},
        600,
      );

      await experiment.run(context);

      expect(writeBenchmarkResults).toHaveBeenCalledWith(
        undefined,
        Path.normalize('CWD/output/query-times.csv'),
        true,
        [],
      );
    });

    it('should not create an output dir if it already exists', async() => {
      files['CWD/output'] = true;
      await experiment.run(context);

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

    it('should run the experiment with breakpoint', async() => {
      let breakpointBarrierResolver: any;
      const breakpointBarrier: any = () => new Promise(resolve => {
        breakpointBarrierResolver = resolve;
      });
      const experimentEnd = experiment.run({ ...context, breakpointBarrier });

      await new Promise(setImmediate);

      expect(hookSparqlEndpoint.start).toHaveBeenCalled();
      expect(endpointHandler.startCollectingStats).toHaveBeenCalled();
      expect(sparqlBenchmarkRun).toHaveBeenCalled();
      expect(endpointHandler.close).not.toHaveBeenCalled();

      breakpointBarrierResolver();
      await experimentEnd;

      expect(endpointHandler.close).toHaveBeenCalled();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalled();

      expect(dirsOut).toEqual({
        'CWD/output': true,
      });
    });

    it('should run the experiment with breakpoint and termination handler', async() => {
      let breakpointBarrierResolver: any;
      const breakpointBarrier: any = () => new Promise(resolve => {
        breakpointBarrierResolver = resolve;
      });
      const experimentEnd = experiment.run({ ...context, breakpointBarrier });

      await new Promise(setImmediate);

      expect(hookSparqlEndpoint.start).toHaveBeenCalled();
      expect(endpointHandler.startCollectingStats).toHaveBeenCalled();
      expect(sparqlBenchmarkRun).toHaveBeenCalled();
      expect(endpointHandler.close).not.toHaveBeenCalled();

      const termHandler = jest.mocked(endpointHandler.addTerminationHandler).mock.calls[0][0];
      termHandler('myProcess');

      expect(context.closeExperiment).toHaveBeenCalledTimes(1);

      breakpointBarrierResolver();
      await experimentEnd;

      expect(endpointHandler.close).toHaveBeenCalled();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalled();

      expect(dirsOut).toEqual({
        'CWD/output': true,
      });
    });
  });

  describe('clean', () => {
    it('should clean without targets', async() => {
      await experiment.clean(context, {});

      expect(hookSparqlEndpoint.clean).toHaveBeenCalledWith(context, {});
    });
  });
});
