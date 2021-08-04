import Path from 'path';
import type { Hook, ITaskContext,
  DockerContainerHandler,
  DockerResourceConstraints, ProcessHandler } from 'jbr';
import { StaticDockerResourceConstraints, createExperimentPaths } from 'jbr';
import { TestLogger } from '../../jbr/test/TestLogger';
import { ExperimentLdbcSnbDecentralized } from '../lib/ExperimentLdbcSnbDecentralized';

let generatorGenerate: any;
jest.mock('ldbc-snb-decentralized/lib/Generator', () => ({
  Generator: jest.fn().mockImplementation(() => ({
    generate: generatorGenerate,
  })),
}));

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

describe('ExperimentLdbcSnbDecentralized', () => {
  let serverHandlerStopCollectingStats: any;
  let serverHandler: DockerContainerHandler;
  let context: ITaskContext;
  let hookSparqlEndpoint: Hook;
  let endpointHandlerStopCollectingStats: any;
  let endpointHandler: ProcessHandler;
  let resourceConstraints: DockerResourceConstraints;
  let experiment: ExperimentLdbcSnbDecentralized;
  beforeEach(() => {
    serverHandlerStopCollectingStats = jest.fn();
    serverHandler = <any> {
      close: jest.fn(),
      startCollectingStats: jest.fn(() => serverHandlerStopCollectingStats),
    };
    context = {
      cwd: 'CWD',
      experimentPaths: createExperimentPaths('CWD'),
      mainModulePath: 'MMP',
      verbose: true,
      cleanupHandlers: [],
      logger: <any> new TestLogger(),
      docker: <any> {
        imageBuilder: {
          build: jest.fn(),
        },
        containerCreator: <any> {
          start: jest.fn(async() => serverHandler),
          remove: jest.fn(),
        },
        statsCollector: {
          collect: jest.fn(),
        },
      },
    };
    endpointHandlerStopCollectingStats = jest.fn();
    endpointHandler = {
      close: jest.fn(),
      join: jest.fn(),
      startCollectingStats: jest.fn(() => endpointHandlerStopCollectingStats),
    };
    hookSparqlEndpoint = <any> {
      prepare: jest.fn(),
      start: jest.fn(() => endpointHandler),
      clean: jest.fn(),
    };
    generatorGenerate = jest.fn();
    sparqlBenchmarkRun = jest.fn(async({ onStart, onStop }) => {
      await onStart();
      await onStop();
    });
    resourceConstraints = new StaticDockerResourceConstraints({}, {});
    experiment = new ExperimentLdbcSnbDecentralized(
      '0.1',
      'input/config-enhancer.json',
      'input/config-fragmenter.json',
      'input/config-fragmenter-auxiliary.json',
      'input/config-queries.json',
      'input/config-server.json',
      'input/templates/queries',
      false,
      '4G',
      'input/dockerfiles/Dockerfile-server',
      hookSparqlEndpoint,
      3_000,
      'info',
      resourceConstraints,
      'http://localhost:3001/sparql',
      3,
      1,
      true,
    );
    files = {};
    dirsOut = {};
    filesOut = {};
    (<any> process).on = jest.fn();
  });

  describe('prepare', () => {
    it('should prepare the experiment', async() => {
      await experiment.prepare(context);

      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context);
      expect(generatorGenerate).toHaveBeenCalled();
      expect(context.docker.imageBuilder.build).toHaveBeenCalledWith({
        cwd: context.cwd,
        dockerFile: 'input/dockerfiles/Dockerfile-server',
        auxiliaryFiles: [ 'input/config-server.json' ],
        imageName: 'jrb-experiment-CWD-server',
        buildArgs: {
          CONFIG_SERVER: 'input/config-server.json',
          LOG_LEVEL: 'info',
        },
      });
    });
  });

  describe('run', () => {
    it('should run the experiment', async() => {
      await experiment.run(context);

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        containerName: 'ldbc-snb-decentralized-server',
        imageName: 'jrb-experiment-CWD-server',
        resourceConstraints,
        logFilePath: Path.join('CWD', 'output', 'logs', 'server.txt'),
        statsFilePath: Path.join(context.cwd, 'output', 'stats-server.csv'),
        hostConfig: {
          Binds: [
            `${context.experimentPaths.root}/generated/out-fragments/:/data`,
          ],
          PortBindings: {
            '3000/tcp': [
              { HostPort: `3000` },
            ],
          },
        },
      });
      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(context);
      expect(serverHandler.startCollectingStats).toHaveBeenCalled();
      expect(endpointHandler.startCollectingStats).toHaveBeenCalled();
      expect(sparqlBenchmarkRun).toHaveBeenCalled();
      expect(serverHandler.close).toHaveBeenCalled();
      expect(endpointHandler.close).toHaveBeenCalled();
      expect(serverHandlerStopCollectingStats).toHaveBeenCalled();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalled();

      expect(dirsOut).toEqual({
        'CWD/output': true,
        'CWD/output/logs': true,
      });
    });

    it('should not create an output dir if it already exists', async() => {
      files['CWD/output'] = true;
      await experiment.run(context);

      expect(dirsOut).toEqual({
        'CWD/output/logs': true,
      });
    });

    it('should gracefully close services on SIGINT', async() => {
      (<any> process).on = jest.fn((event, cb) => {
        if (event === 'SIGINT') {
          cb();
        }
      });

      await experiment.run(context);

      expect(context.docker.containerCreator.start).toHaveBeenCalled();
      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(context);
      expect(serverHandler.close).toHaveBeenCalled();
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
      expect(serverHandler.startCollectingStats).toHaveBeenCalled();
      expect(endpointHandler.startCollectingStats).toHaveBeenCalled();
      expect(sparqlBenchmarkRun).toHaveBeenCalled();
      expect(serverHandler.close).not.toHaveBeenCalled();

      breakpointBarrierResolver();
      await experimentEnd;

      expect(serverHandler.close).toHaveBeenCalled();
      expect(endpointHandler.close).toHaveBeenCalled();
      expect(serverHandlerStopCollectingStats).toHaveBeenCalled();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalled();

      expect(dirsOut).toEqual({
        'CWD/output': true,
        'CWD/output/logs': true,
      });
    });
  });

  describe('clean', () => {
    it('should clean without targets', async() => {
      await experiment.clean(context, {});

      expect(hookSparqlEndpoint.clean).toHaveBeenCalledWith(context, {});
    });

    it('should clean with docker target', async() => {
      await experiment.clean(context, { docker: true });

      expect(hookSparqlEndpoint.clean).toHaveBeenCalledWith(context, { docker: true });

      expect(context.docker.containerCreator.remove).toHaveBeenCalledWith('ldbc-snb-decentralized-server');
    });
  });
});
