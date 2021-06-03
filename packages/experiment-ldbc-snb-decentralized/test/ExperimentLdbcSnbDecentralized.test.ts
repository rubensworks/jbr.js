import Path from 'path';
import type { Hook, ITaskContext, DockerContainerCreator,
  DockerContainerHandler,
  DockerResourceConstraints, ProcessHandler } from 'jbr';
import {
  DockerStatsCollector,
  StaticDockerResourceConstraints,
} from 'jbr';
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

let buildImage: any;
let modem: any;
jest.mock('dockerode', () => jest.fn().mockImplementation(() => ({
  buildImage,
  modem,
})));

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
}));

describe('ExperimentLdbcSnbDecentralized', () => {
  let context: ITaskContext;
  let hookSparqlEndpoint: Hook;
  let endpointHandler: ProcessHandler;
  let serverCreator: DockerContainerCreator;
  let serverStatsCollector: DockerStatsCollector;
  let serverHandler: DockerContainerHandler;
  let resourceConstraints: DockerResourceConstraints;
  let experiment: ExperimentLdbcSnbDecentralized;
  beforeEach(() => {
    context = {
      cwd: 'CWD',
      mainModulePath: 'MMP',
      verbose: true,
      exitProcess: jest.fn(),
      logger: <any> new TestLogger(),
    };
    endpointHandler = {
      close: jest.fn(),
    };
    hookSparqlEndpoint = <any> {
      prepare: jest.fn(),
      start: jest.fn(() => endpointHandler),
    };
    generatorGenerate = jest.fn();
    sparqlBenchmarkRun = jest.fn();
    buildImage = jest.fn(() => 'IMAGE');
    modem = {
      followProgress: jest.fn((stream, cb) => cb(undefined, true)),
    };
    serverStatsCollector = {
      collect: jest.fn(),
    };
    serverHandler = <any> {
      close: jest.fn(),
    };
    serverCreator = {
      start: jest.fn(async() => serverHandler),
    };
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
      serverCreator,
      serverStatsCollector,
    );
    files = {};
    dirsOut = {};
    filesOut = {};
    (<any> process).on = jest.fn();
  });

  describe('instantiated with default values', () => {
    it('should have a DockerStatsCollector', async() => {
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
        new StaticDockerResourceConstraints({}, {}),
        'http://localhost:3001/sparql',
        3,
        1,
        true,
      );
      expect(experiment.serverStatsCollector).toBeInstanceOf(DockerStatsCollector);
    });
  });

  describe('prepare', () => {
    it('should prepare the experiment', async() => {
      await experiment.prepare(context);

      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context);
      expect(generatorGenerate).toHaveBeenCalled();
      expect(buildImage).toHaveBeenCalledWith({
        context: context.cwd,
        src: [ 'input/dockerfiles/Dockerfile-server', 'input/config-server.json' ],
      }, {
        t: 'jrb-experiment-CWD-server',
        buildargs: {
          CONFIG_SERVER: 'input/config-server.json',
          LOG_LEVEL: 'info',
        },
        dockerfile: 'input/dockerfiles/Dockerfile-server',
      });
      expect(modem.followProgress).toHaveBeenCalledWith('IMAGE', expect.any(Function));
    });

    it('should propagate modem errors', async() => {
      modem.followProgress = jest.fn((stream, cb) => {
        cb(new Error('Container modem error'));
      });
      await expect(experiment.prepare(context)).rejects.toThrowError('Container modem error');
    });
  });

  describe('run', () => {
    it('should run the experiment', async() => {
      await experiment.run(context);

      expect(serverCreator.start).toHaveBeenCalledWith({
        dockerode: expect.anything(),
        imageName: 'jrb-experiment-CWD-server',
        resourceConstraints,
        logFilePath: Path.join('CWD', 'output', 'logs', 'server.txt'),
        hostConfig: {
          Binds: [
            `${context.cwd}/generated/out-fragments/:/data`,
          ],
          PortBindings: {
            '3000/tcp': [
              { HostPort: `3000` },
            ],
          },
        },
      });
      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(context);
      expect(serverStatsCollector.collect)
        .toHaveBeenCalledWith(serverHandler, Path.join(context.cwd, 'output', 'stats-server.csv'));
      expect(sparqlBenchmarkRun).toHaveBeenCalled();
      expect(serverHandler.close).toHaveBeenCalled();
      expect(endpointHandler.close).toHaveBeenCalled();
      expect(context.exitProcess).not.toHaveBeenCalled();

      expect(dirsOut).toEqual({
        'CWD/output': true,
      });
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

      expect(serverCreator.start).toHaveBeenCalled();
      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(context);
      expect(serverHandler.close).toHaveBeenCalled();
      expect(endpointHandler.close).toHaveBeenCalled();
      expect(context.exitProcess).toHaveBeenCalled();
    });
  });
});
