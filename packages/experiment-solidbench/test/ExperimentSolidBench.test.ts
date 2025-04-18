import * as Path from 'path';
import v8 from 'v8';
import type { Hook, ITaskContext,
  DockerContainerHandler,
  DockerResourceConstraints, ProcessHandler } from 'jbr';
import { StaticDockerResourceConstraints, createExperimentPaths } from 'jbr';
import { TestLogger } from '../../jbr/test/TestLogger';
import { ExperimentSolidBench } from '../lib/ExperimentSolidBench';

let generatorGenerate: any;
jest.mock('solidbench/lib/Generator', () => ({
  Generator: jest.fn().mockImplementation(() => ({
    generate: generatorGenerate,
  })),
}));

let sparqlBenchmarkRun: any;
let queryLoaderLoadQueries: any;
let resultSerializerSerialize: any;
jest.mock('sparql-benchmark-runner', () => ({
  SparqlBenchmarkRunner: jest.fn().mockImplementation((options: any) => {
    options.logger('Test logger');
    return {
      run: sparqlBenchmarkRun,
    };
  }),
  ResultSerializerCsv: jest.fn().mockImplementation(() => ({
    serialize: resultSerializerSerialize,
  })),
  QueryLoaderFile: jest.fn().mockImplementation(() => ({
    loadQueries: queryLoaderLoadQueries,
  })),
}));

let files: Record<string, boolean | string> = {};
let filesOut: Record<string, boolean | string> = {};
let dirsOut: Record<string, boolean | string> = {};
jest.mock('fs-extra', () => ({
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  ...<any>jest.requireActual('fs-extra'),
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
  async readdir(dir: string) {
    const ret: any[] = [];
    for (const path of Object.keys(filesOut)) {
      if (path.startsWith(dir)) {
        let name = path.slice(dir.length + 1);
        const slashPos = name.indexOf('/');
        const isFile = slashPos < 0;
        if (!isFile) {
          name = name.slice(0, slashPos);
        }
        ret.push({
          name,
          isFile: () => isFile,
          isDirectory: () => !isFile,
        });
      }
    }
    return ret;
  },
  async readFile(path: string) {
    if (!(path in filesOut)) {
      throw new Error(`Could not find file at ${path}`);
    }
    return filesOut[path];
  },
  async writeFile(path: string, contents: string) {
    return filesOut[path] = contents;
  },
}));

describe('ExperimentSolidBench', () => {
  let serverHandlerStopCollectingStats: any;
  let serverHandler: DockerContainerHandler;
  let logger: any;
  let context: ITaskContext;
  let hookSparqlEndpoint: Hook;
  let endpointHandlerStopCollectingStats: any;
  let endpointHandler: ProcessHandler;
  let resourceConstraints: DockerResourceConstraints;
  let experiment: ExperimentSolidBench;
  beforeEach(() => {
    serverHandlerStopCollectingStats = jest.fn();
    serverHandler = <any> {
      close: jest.fn(),
      startCollectingStats: jest.fn(() => serverHandlerStopCollectingStats),
      addTerminationHandler: jest.fn(),
      removeTerminationHandler: jest.fn(),
    };
    logger = new TestLogger();
    context = {
      cwd: 'CWD',
      experimentPaths: createExperimentPaths('CWD'),
      experimentName: 'EXP',
      mainModulePath: 'MMP',
      verbose: true,
      closeExperiment: jest.fn(),
      cleanupHandlers: [],
      logger,
      docker: <any> {
        imageBuilder: {
          build: jest.fn(),
          getImageName: (ctx: any, suffix: string) => `IMG-${suffix}`,
        },
        containerCreator: <any> {
          start: jest.fn(async() => serverHandler),
          remove: jest.fn(),
        },
        statsCollector: {
          collect: jest.fn(),
        },
        networkCreator: {
          create: jest.fn(() => ({
            network: { id: 'NETWORK' },
            startCollectingStats: jest.fn(() => jest.fn()),
            close: jest.fn(),
            addTerminationHandler: jest.fn(),
            removeTerminationHandler: jest.fn(),
          })),
          remove: jest.fn(),
        },
      },
    };
    endpointHandlerStopCollectingStats = jest.fn();
    endpointHandler = {
      close: jest.fn(),
      join: jest.fn(),
      startCollectingStats: jest.fn(() => endpointHandlerStopCollectingStats),
      addTerminationHandler: jest.fn(),
      removeTerminationHandler: jest.fn(),
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
    queryLoaderLoadQueries = jest.fn();
    resultSerializerSerialize = jest.fn();
    resourceConstraints = new StaticDockerResourceConstraints({}, {});
    experiment = new ExperimentSolidBench({
      scale: '0.1',
      configEnhance: 'input/config-enhancer.json',
      configFragment: 'input/config-fragmenter.json',
      configQueries: 'input/config-queries.json',
      configServer: 'input/config-server.json',
      validationParamsUrl: 'input/config-validation-params.json',
      configValidation: 'input/config-validation-config.json',
      hadoopMemory: '4G',
      dockerfileServer: 'input/dockerfiles/Dockerfile-server',
      hookSparqlEndpoint,
      serverPort: 3_000,
      serverLogLevel: 'info',
      serverBaseUrl: 'http://localhost:3000',
      serverResourceConstraints: resourceConstraints,
      endpointUrl: 'http://localhost:3001/sparql',
      queryRunnerReplication: 3,
      queryRunnerWarmupRounds: 1,
      queryRunnerRequestDelay: 0,
      queryRunnerEndpointAvailabilityCheckTimeout: 1_000,
      queryRunnerUrlParams: {},
      queryTimeoutFallback: 600,
    });
    files = {};
    dirsOut = {};
    filesOut = {};
    (<any> process).on = jest.fn();
    jest.spyOn(v8, 'getHeapStatistics').mockImplementation(() => (<any>{ heap_size_limit: 8192 * 1024 * 1024 }));
  });

  describe('replaceBaseUrlInDir', () => {
    it('should handle nested directories', async() => {
      filesOut['dir/a.ttl'] = ``;
      filesOut['dir/b.ttl'] = `localhost:3000`;
      filesOut['dir/c/c.ttl'] = ``;
      filesOut['dir/c/d.ttl'] = ``;

      await experiment.replaceBaseUrlInDir('dir');

      expect(filesOut['dir/a.ttl']).toEqual('');
      expect(filesOut['dir/b.ttl']).toEqual('solidbench-server:3000');
      expect(filesOut['dir/c/c.ttl']).toEqual('');
      expect(filesOut['dir/c/d.ttl']).toEqual('');
    });
  });

  describe('prepare', () => {
    it('should prepare the experiment', async() => {
      await experiment.prepare(context, false);

      expect(context.logger.warn).not.toHaveBeenCalled();
      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context, false);
      expect(generatorGenerate).toHaveBeenCalled();
      expect(context.docker.imageBuilder.build).toHaveBeenCalledWith({
        cwd: context.cwd,
        dockerFile: 'input/dockerfiles/Dockerfile-server',
        auxiliaryFiles: [ 'input/config-server.json' ],
        imageName: 'IMG-solidbench-server',
        buildArgs: {
          CONFIG_SERVER: 'input/config-server.json',
          BASE_URL: 'http://localhost:3000',
          LOG_LEVEL: 'info',
        },
        logger,
      });
    });

    it('should prepare the experiment without validation', async() => {
      (<any>experiment).validationParamsUrl = undefined;
      (<any>experiment).configValidation = undefined;
      await experiment.prepare(context, false);

      expect(context.logger.warn).not.toHaveBeenCalled();
      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context, false);
      expect(generatorGenerate).toHaveBeenCalled();
      expect(context.docker.imageBuilder.build).toHaveBeenCalledWith({
        cwd: context.cwd,
        dockerFile: 'input/dockerfiles/Dockerfile-server',
        auxiliaryFiles: [ 'input/config-server.json' ],
        imageName: 'IMG-solidbench-server',
        buildArgs: {
          CONFIG_SERVER: 'input/config-server.json',
          BASE_URL: 'http://localhost:3000',
          LOG_LEVEL: 'info',
        },
        logger,
      });
    });

    it('should warn when not enough memory for preparing', async() => {
      jest.spyOn(v8, 'getHeapStatistics').mockImplementation(() => (<any>{ heap_size_limit: 4096 * 1024 * 1024 }));

      await experiment.prepare(context, false);

      expect(context.logger.warn).toHaveBeenCalledWith(`SolidBench recommends allocating at least 8192 MB of memory, while only 4096 was allocated.
This can be configured using Node's --max_old_space_size option.`);
    });

    it('should prepare the experiment with force overwrite', async() => {
      await experiment.prepare(context, true);

      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context, true);
      expect(generatorGenerate).toHaveBeenCalled();
      expect(context.docker.imageBuilder.build).toHaveBeenCalledWith({
        cwd: context.cwd,
        dockerFile: 'input/dockerfiles/Dockerfile-server',
        auxiliaryFiles: [ 'input/config-server.json' ],
        imageName: 'IMG-solidbench-server',
        buildArgs: {
          CONFIG_SERVER: 'input/config-server.json',
          BASE_URL: 'http://localhost:3000',
          LOG_LEVEL: 'info',
        },
        logger,
      });
    });
  });

  describe('run', () => {
    beforeEach(() => {
      experiment.httpAvailabilityLatch.sleepUntilAvailable = () => Promise.resolve();
    });

    it('should run the experiment', async() => {
      await experiment.run(context);

      expect(context.docker.networkCreator.create).toHaveBeenCalledWith({
        Name: 'IMG-solidbench-network',
      });
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        containerName: 'solidbench-server',
        imageName: 'IMG-solidbench-server',
        resourceConstraints,
        logFilePath: Path.join('CWD', 'output', 'logs', 'server.txt'),
        statsFilePath: Path.join(context.cwd, 'output', 'stats-server.csv'),
        hostConfig: {
          Binds: [
            `${context.experimentPaths.root}/generated/out-fragments/http/localhost_3000/:/data`,
          ],
          NetworkMode: 'NETWORK',
          PortBindings: {
            '3000/tcp': [
              { HostPort: `3000` },
            ],
          },
        },
      });
      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(context, { docker: { network: 'NETWORK' }});
      expect(serverHandler.startCollectingStats).toHaveBeenCalled();
      expect(endpointHandler.startCollectingStats).toHaveBeenCalled();
      expect(sparqlBenchmarkRun).toHaveBeenCalled();
      expect(serverHandler.close).toHaveBeenCalled();
      expect(endpointHandler.close).toHaveBeenCalled();
      expect(serverHandlerStopCollectingStats).toHaveBeenCalled();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalled();
      // eslint-disable-next-line unicorn/no-useless-undefined
      expect(resultSerializerSerialize).toHaveBeenCalledWith(Path.normalize('CWD/output/query-times.csv'), undefined);

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

      expect(context.docker.networkCreator.create).toHaveBeenCalled();
      expect(context.docker.networkCreator.create).toHaveBeenCalled();
      expect(context.docker.containerCreator.start).toHaveBeenCalled();
      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(context, { docker: { network: 'NETWORK' }});
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

      expect(context.docker.networkCreator.create).toHaveBeenCalled();
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

    it('should run the experiment with breakpoint and termination handler', async() => {
      let breakpointBarrierResolver: any;
      const breakpointBarrier: any = () => new Promise(resolve => {
        breakpointBarrierResolver = resolve;
      });
      const experimentEnd = experiment.run({ ...context, breakpointBarrier });

      await new Promise(setImmediate);

      expect(context.docker.networkCreator.create).toHaveBeenCalled();
      expect(hookSparqlEndpoint.start).toHaveBeenCalled();
      expect(serverHandler.startCollectingStats).toHaveBeenCalled();
      expect(endpointHandler.startCollectingStats).toHaveBeenCalled();
      expect(sparqlBenchmarkRun).toHaveBeenCalled();
      expect(serverHandler.close).not.toHaveBeenCalled();

      const termHandler = jest.mocked(serverHandler.addTerminationHandler).mock.calls[0][0];
      termHandler('myProcess');

      expect(context.closeExperiment).toHaveBeenCalledTimes(1);

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

      expect(context.docker.networkCreator.remove)
        .toHaveBeenCalledWith('IMG-solidbench-network');
      expect(context.docker.containerCreator.remove).toHaveBeenCalledWith('solidbench-server');
    });
  });
});
