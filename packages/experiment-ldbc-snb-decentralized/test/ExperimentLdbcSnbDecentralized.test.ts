import Path from 'path';
import type { Hook, ITaskContext } from 'jbr';
import { DockerStatsCollector, StaticDockerResourceConstraints } from 'jbr';
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
let createContainer: any;
let modem: any;
jest.mock('dockerode', () => jest.fn().mockImplementation(() => ({
  buildImage,
  createContainer,
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
  let closeEndpoint: any;
  let serverStatsCollector: DockerStatsCollector;
  let experiment: ExperimentLdbcSnbDecentralized;
  let container: any;
  beforeEach(() => {
    context = {
      cwd: 'CWD',
      mainModulePath: 'MMP',
      verbose: true,
      exitProcess: jest.fn(),
      logger: <any> new TestLogger(),
    };
    closeEndpoint = jest.fn();
    hookSparqlEndpoint = <any> {
      prepare: jest.fn(),
      start: jest.fn(() => closeEndpoint),
    };
    generatorGenerate = jest.fn();
    sparqlBenchmarkRun = jest.fn();
    buildImage = jest.fn(() => 'IMAGE');
    container = {
      attach: jest.fn(() => ({ pipe: jest.fn() })),
      start: jest.fn(),
      kill: jest.fn(),
      remove: jest.fn(),
    };
    createContainer = jest.fn(() => container);
    modem = {
      followProgress: jest.fn((stream, cb) => cb(undefined, true)),
    };
    serverStatsCollector = {
      collect: jest.fn(),
    };
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

      expect(createContainer).toHaveBeenCalledWith({
        Image: 'jrb-experiment-CWD-server',
        Tty: true,
        AttachStdout: true,
        AttachStderr: true,
        HostConfig: {
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
      expect(container.attach).toHaveBeenCalledWith({
        stream: true,
        stdout: true,
        stderr: true,
      });
      expect(container.start).toHaveBeenCalled();
      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(context);
      expect(serverStatsCollector.collect)
        .toHaveBeenCalledWith(container, Path.join(context.cwd, 'output', 'stats-server.csv'));
      expect(sparqlBenchmarkRun).toHaveBeenCalled();
      expect(container.kill).toHaveBeenCalled();
      expect(container.remove).toHaveBeenCalled();
      expect(closeEndpoint).toHaveBeenCalled();
      expect(context.exitProcess).not.toHaveBeenCalled();

      expect(filesOut).toEqual({
        'CWD/output/logs/server.txt': true,
      });
      expect(dirsOut).toEqual({
        'CWD/output': true,
      });
    });

    it('should not create an output dir if it already exists', async() => {
      files['CWD/output'] = true;
      await experiment.run(context);

      expect(filesOut).toEqual({
        'CWD/output/logs/server.txt': true,
      });
      expect(dirsOut).toEqual({});
    });

    it('should gracefully close services on SIGINT', async() => {
      (<any> process).on = jest.fn((event, cb) => {
        if (event === 'SIGINT') {
          cb();
        }
      });

      await experiment.run(context);

      expect(createContainer).toHaveBeenCalled();
      expect(container.attach).toHaveBeenCalled();
      expect(container.start).toHaveBeenCalled();
      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(context);
      expect(container.kill).toHaveBeenCalled();
      expect(container.remove).toHaveBeenCalled();
      expect(closeEndpoint).toHaveBeenCalled();
      expect(context.exitProcess).toHaveBeenCalled();
    });
  });
});
