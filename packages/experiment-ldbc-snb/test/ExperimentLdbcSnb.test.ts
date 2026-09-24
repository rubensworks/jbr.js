import Path from 'node:path';
import type { Hook, ITaskContext, ProcessHandler } from 'jbr';
import { HdtConverter, createExperimentPaths } from 'jbr';
import { SparqlBenchmarkRunner } from 'sparql-benchmark-runner';
import { runConfig } from 'sparql-query-parameter-instantiator';
import { TestLogger } from '../../jbr/test/TestLogger';
import { ExperimentLdbcSnb } from '../lib/ExperimentLdbcSnb';
import { generateMessageParameters, generatePersonParameters } from '../lib/ParameterGenerator';
import { mergeTurtleToNTriples } from '../lib/TurtleMerger';

let sparqlBenchmarkRun: any;
let resultSerializerSerialize: any;
let resultSerializerRawSerialize: any;

jest.mock<any>('sparql-benchmark-runner', () => ({
  SparqlBenchmarkRunner: jest.fn().mockImplementation((options: any) => {
    options.logger('Test logger');
    return {
      runWithRawResults: sparqlBenchmarkRun,
    };
  }),
  QueryLoaderFile: jest.fn().mockImplementation(() => ({
    loadQueries: jest.fn().mockResolvedValue({
      C1: 'path/C1',
      C2: 'path/C2',
      C3: 'path/C3',
    }),
  })),
  ResultSerializerCsv: jest.fn().mockImplementation(() => ({
    serialize: resultSerializerSerialize,
  })),
  ResultSerializerRaw: jest.fn().mockImplementation(() => ({
    serialize: resultSerializerRawSerialize,
  })),
}));

jest.mock<any>('sparql-query-parameter-instantiator', () => ({
  runConfig: jest.fn(),
}));

jest.mock<any>('../lib/TurtleMerger', () => ({
  mergeTurtleToNTriples: jest.fn(async() => 123),
}));

jest.mock<any>('../lib/ParameterGenerator', () => ({
  generatePersonParameters: jest.fn(async() => 15),
  generateMessageParameters: jest.fn(async() => 200),
}));

let files: Record<string, boolean | string> = {};
let filesOut: Record<string, boolean | string> = {};
let dirsOut: Record<string, boolean | string> = {};
let dirsRemoved: string[] = [];
let dirContents: Record<string, string[]> = {};
jest.mock<any>('fs-extra', () => ({
  ...jest.requireActual('fs-extra'),
  async pathExists(path: string) {
    return path in files || path in dirContents;
  },
  async readdir(path: string) {
    return dirContents[path] ?? jest.requireActual('fs-extra').readdir(path);
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
  async remove(dirPath: string) {
    dirsRemoved.push(dirPath);
  },
  async writeFile(path: string, contents: string) {
    filesOut[path] = contents;
  },
}));

describe('ExperimentLdbcSnb', () => {
  let context: ITaskContext;
  let hookSparqlEndpoint: Hook;
  let endpointHandlerStopCollectingStats: any;
  let endpointHandler: ProcessHandler;
  let experiment: ExperimentLdbcSnb;
  let generated: string;
  let socialNetwork: string;
  let substitutionParameters: string;
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
    generated = context.experimentPaths.generated;
    socialNetwork = Path.join(generated, 'out-snb', 'social_network');
    substitutionParameters = Path.join(generated, 'out-snb', 'substitution_parameters');
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
      return {
        aggregateResults: {},
        rawResults: {},
      };
    });
    resultSerializerSerialize = jest.fn();
    resultSerializerRawSerialize = jest.fn();
    experiment = new ExperimentLdbcSnb(
      '0.1',
      '4G',
      5,
      12345,
      false,
      hookSparqlEndpoint,
      'http://localhost:3001/sparql',
      undefined,
      3,
      1,
      0,
      1_000,
      {},
      600,
    );
    files = {};
    dirsOut = {};
    filesOut = {};
    dirsRemoved = [];
    dirContents = {};
    jest.spyOn(<any> process, 'on').mockImplementation();
    jest.clearAllMocks();
  });

  function generateSocialNetworkFiles(): void {
    dirContents[socialNetwork] = [
      '.social_network_person_0_0.ttl.crc',
      'social_network_person_1_0.ttl',
      'social_network_person_0_0.ttl',
      'social_network_activity_0_0.ttl',
      'social_network_static_0_0.ttl',
      'updateStream_0_0_person.csv',
    ];
  }

  function expectDatagen(): void {
    expect(context.docker.imagePuller.pull).toHaveBeenCalledWith({
      repoTag: ExperimentLdbcSnb.DOCKER_IMAGE_LDBC_SNB_DATAGEN,
    });
    expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
      imageName: ExperimentLdbcSnb.DOCKER_IMAGE_LDBC_SNB_DATAGEN,
      env: [ 'HADOOP_CLIENT_OPTS=-Xmx4G' ],
      hostConfig: {
        Binds: [
          `${Path.join(generated, 'out-snb')}:/opt/ldbc_snb_datagen/out`,
          `${Path.join(generated, 'params.ini')}:/opt/ldbc_snb_datagen/params.ini`,
        ],
      },
      logFilePath: Path.join(context.experimentPaths.output, 'logs', 'ldbc-snb-generation.txt'),
    });
    expect(filesOut[Path.join(generated, 'params.ini')]).toBe(`ldbc.snb.datagen.generator.scaleFactor:snb.interactive.0.1
ldbc.snb.datagen.serializer.dynamicActivitySerializer:ldbc.snb.datagen.serializer.snb.turtle.TurtleDynamicActivitySerializer
ldbc.snb.datagen.serializer.dynamicPersonSerializer:ldbc.snb.datagen.serializer.snb.turtle.TurtleDynamicPersonSerializer
ldbc.snb.datagen.serializer.staticSerializer:ldbc.snb.datagen.serializer.snb.turtle.TurtleStaticSerializer
`);
  }

  function expectPostDatagen(): void {
    expect(mergeTurtleToNTriples).toHaveBeenCalledWith([
      Path.join(socialNetwork, 'social_network_activity_0_0.ttl'),
      Path.join(socialNetwork, 'social_network_person_0_0.ttl'),
      Path.join(socialNetwork, 'social_network_person_1_0.ttl'),
      Path.join(socialNetwork, 'social_network_static_0_0.ttl'),
    ], Path.join(generated, 'dataset.nt'));
    expect(generatePersonParameters).toHaveBeenCalledWith(
      Path.join(substitutionParameters, 'interactive_1_param.txt'),
      Path.join(generated, 'parameters-persons.csv'),
    );
    expect(generateMessageParameters).toHaveBeenCalledWith(
      [ Path.join(socialNetwork, 'social_network_activity_0_0.ttl') ],
      Path.join(generated, 'parameters-messages.csv'),
      200,
      12345,
    );
    expect(runConfig).toHaveBeenCalledTimes(1);
    const [ configPath, properties, settings ] = jest.mocked(runConfig).mock.calls[0];
    expect(configPath).toBe(Path.join(ExperimentLdbcSnb.TEMPLATES_PATH, 'query-config.json'));
    expect(properties).toEqual({ mainModulePath: Path.join(__dirname, '..') });
    const variables = settings!.variables!;
    expect(variables['urn:variables:ldbc-snb:count']).toBe(5);
    expect(variables['urn:variables:ldbc-snb:seed']).toBe(12345);
    expect(variables['urn:variables:ldbc-snb:params:persons']).toBe(Path.join(generated, 'parameters-persons.csv'));
    expect(variables['urn:variables:ldbc-snb:params:messages']).toBe(Path.join(generated, 'parameters-messages.csv'));
    expect(variables['urn:variables:ldbc-snb:params:interactive_14'])
      .toBe(Path.join(substitutionParameters, 'interactive_14_param.txt'));
    expect(variables['urn:variables:ldbc-snb:templates:interactive-complex-14'])
      .toBe(Path.join(ExperimentLdbcSnb.TEMPLATES_PATH, 'queries', 'interactive-complex-14.sparql'));
    expect(variables['urn:variables:ldbc-snb:output:interactive-short-7'])
      .toBe(Path.join(generated, 'queries', 'interactive-short-7.sparql'));
    expect(Object.keys(variables).filter(key => key.startsWith('urn:variables:ldbc-snb:templates:'))).toHaveLength(21);
    expect(dirsRemoved).toEqual([ Path.join(generated, 'queries') ]);
  }

  describe('prepare', () => {
    it('should prepare the experiment', async() => {
      generateSocialNetworkFiles();
      await experiment.prepare(context, false);

      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context, false);
      expect(context.docker.imagePuller.pull).toHaveBeenCalledTimes(0);
      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(0);
      expectPostDatagen();

      expect(dirsOut).toEqual({
        'CWD/output/logs': true,
        [Path.join(generated, 'queries')]: true,
      });
    });

    it('should run the datagen if its output does not exist', async() => {
      jest.mocked(context.docker.containerCreator.start).mockImplementation(async() => {
        generateSocialNetworkFiles();
        return <any> endpointHandler;
      });
      await experiment.prepare(context, false);

      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context, false);
      expect(context.docker.imagePuller.pull).toHaveBeenCalledTimes(1);
      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(1);
      expect(endpointHandler.join).toHaveBeenCalledTimes(1);
      expectDatagen();
      expectPostDatagen();

      expect(dirsOut).toEqual({
        'CWD/output/logs': true,
        [Path.join(generated, 'out-snb')]: true,
        [Path.join(generated, 'queries')]: true,
      });
    });

    it('should prepare the experiment if files already exist', async() => {
      generateSocialNetworkFiles();
      files[Path.join(generated, 'dataset.nt')] = true;
      files[Path.join(generated, 'parameters-persons.csv')] = true;
      files[Path.join(generated, 'parameters-messages.csv')] = true;
      files[Path.join(generated, 'queries')] = true;

      await experiment.prepare(context, false);

      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context, false);
      expect(context.docker.imagePuller.pull).toHaveBeenCalledTimes(0);
      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(0);
      expect(mergeTurtleToNTriples).not.toHaveBeenCalled();
      expect(generatePersonParameters).not.toHaveBeenCalled();
      expect(generateMessageParameters).not.toHaveBeenCalled();
      expect(runConfig).not.toHaveBeenCalled();

      expect(dirsOut).toEqual({
        'CWD/output/logs': true,
      });
    });

    it('should regenerate parameters if only one parameters file exists', async() => {
      generateSocialNetworkFiles();
      files[Path.join(generated, 'dataset.nt')] = true;
      files[Path.join(generated, 'parameters-persons.csv')] = true;
      files[Path.join(generated, 'queries')] = true;

      await experiment.prepare(context, false);

      expect(generatePersonParameters).toHaveBeenCalledTimes(1);
      expect(generateMessageParameters).toHaveBeenCalledTimes(1);
    });

    it('should forcefully prepare the experiment if files already exist', async() => {
      generateSocialNetworkFiles();
      files[Path.join(generated, 'dataset.nt')] = true;
      files[Path.join(generated, 'parameters-persons.csv')] = true;
      files[Path.join(generated, 'parameters-messages.csv')] = true;
      files[Path.join(generated, 'queries')] = true;

      await experiment.prepare(context, true);

      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context, true);
      expect(context.docker.imagePuller.pull).toHaveBeenCalledTimes(1);
      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(1);
      expectDatagen();
      expectPostDatagen();
    });

    it('should prepare the experiment with HDT', async() => {
      generateSocialNetworkFiles();
      experiment = new ExperimentLdbcSnb(
        '1',
        '8G',
        20,
        1,
        true,
        hookSparqlEndpoint,
        'http://localhost:3001/sparql',
        'http://localhost:3001/',
        3,
        1,
        0,
        1_000,
        {},
        600,
      );

      await experiment.prepare(context, false);

      expect(generateMessageParameters).toHaveBeenCalledWith(
        [ Path.join(socialNetwork, 'social_network_activity_0_0.ttl') ],
        Path.join(generated, 'parameters-messages.csv'),
        400,
        1,
      );
      expect(context.docker.imagePuller.pull).toHaveBeenCalledTimes(1);
      expect(context.docker.imagePuller.pull).toHaveBeenCalledWith({
        repoTag: HdtConverter.DOCKER_IMAGE_HDT,
      });
      expect(context.docker.containerCreator.start).toHaveBeenCalledTimes(2);
      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: HdtConverter.DOCKER_IMAGE_HDT,
        cmdArgs: [ 'rdf2hdt', '/output/dataset.nt', '/output/dataset.hdt' ],
        hostConfig: {
          Binds: [
            `${generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'ldbc-snb-hdt.txt'),
      });
    });

    it('should use the given scale and memory for the datagen', async() => {
      experiment = new ExperimentLdbcSnb(
        '3',
        '16G',
        5,
        12345,
        false,
        hookSparqlEndpoint,
        'http://localhost:3001/sparql',
        undefined,
        3,
        1,
        0,
        1_000,
        {},
        600,
      );
      generateSocialNetworkFiles();

      await experiment.prepare(context, true);

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith(expect.objectContaining({
        env: [ 'HADOOP_CLIENT_OPTS=-Xmx16G' ],
      }));
      expect(filesOut[Path.join(generated, 'params.ini')])
        .toMatch(/^ldbc\.snb\.datagen\.generator\.scaleFactor:snb\.interactive\.3\n/u);
    });

    it('should throw if the datagen produced no output', async() => {
      await expect(experiment.prepare(context, false)).rejects
        .toThrow(`Could not find any LDBC SNB static/person/activity files in ${socialNetwork}, check the generation logs`);
    });

    it('should throw if the datagen produced no activity output', async() => {
      dirContents[socialNetwork] = [ 'social_network_person_0_0.ttl' ];
      await expect(experiment.prepare(context, false)).rejects
        .toThrow(`Could not find any LDBC SNB activity files in ${socialNetwork}, check the generation logs`);
    });
  });

  describe('run', () => {
    it('should run the experiment', async() => {
      await experiment.run(context);

      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(context);
      expect(endpointHandler.startCollectingStats).toHaveBeenCalledWith();
      expect(sparqlBenchmarkRun).toHaveBeenCalledWith(expect.anything());
      expect(endpointHandler.close).toHaveBeenCalledWith();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalledWith();

      expect(resultSerializerSerialize).toHaveBeenCalledWith(
        Path.normalize('CWD/output/query-times.csv'),
        {},
      );
      expect(resultSerializerRawSerialize).toHaveBeenCalledWith(
        Path.normalize('CWD/output/query-results-raw.json'),
        {},
      );
      expect(filesOut[Path.join(context.experimentPaths.output, 'logs', 'load-time.csv')]).toMatch(/^time\n\d+$/u);

      expect(dirsOut).toEqual({
        'CWD/output': true,
      });

      expect(SparqlBenchmarkRunner).toHaveBeenCalledWith(expect.objectContaining({
        endpoint: 'http://localhost:3001/sparql',
        endpointUpCheck: 'http://localhost:3001/sparql',
        querySets: {
          C1: 'path/C1',
          C2: 'path/C2',
          C3: 'path/C3',
        },
        timeout: 600,
      }));
    });

    it('should not create an output dir if it already exists', async() => {
      files['CWD/output'] = true;
      await experiment.run(context);

      expect(dirsOut).toEqual({});
    });

    it('should not serialize raw results if the runner does not produce them', async() => {
      sparqlBenchmarkRun = jest.fn(async({ onStart, onStop }: any) => {
        await onStart();
        await onStop();
        return { aggregateResults: {}};
      });

      await experiment.run(context);

      expect(resultSerializerSerialize).toHaveBeenCalledWith(
        Path.normalize('CWD/output/query-times.csv'),
        {},
      );
      expect(resultSerializerRawSerialize).not.toHaveBeenCalled();
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

    it('should run the experiment with breakpoint', async() => {
      let breakpointBarrierResolver: any;
      const breakpointBarrier: any = () => new Promise((resolve) => {
        breakpointBarrierResolver = resolve;
      });
      const experimentEnd = experiment.run({ ...context, breakpointBarrier });

      await new Promise(setImmediate);

      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(expect.anything());
      expect(endpointHandler.startCollectingStats).toHaveBeenCalledWith();
      expect(sparqlBenchmarkRun).toHaveBeenCalledWith(expect.anything());
      expect(endpointHandler.close).not.toHaveBeenCalled();

      breakpointBarrierResolver();
      await experimentEnd;

      expect(endpointHandler.close).toHaveBeenCalledWith();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalledWith();

      expect(dirsOut).toEqual({
        'CWD/output': true,
      });
    });

    it('should run the experiment with breakpoint and termination handler', async() => {
      let breakpointBarrierResolver: any;
      const breakpointBarrier: any = () => new Promise((resolve) => {
        breakpointBarrierResolver = resolve;
      });
      const experimentEnd = experiment.run({ ...context, breakpointBarrier });

      await new Promise(setImmediate);

      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(expect.anything());
      expect(endpointHandler.startCollectingStats).toHaveBeenCalledWith();
      expect(sparqlBenchmarkRun).toHaveBeenCalledWith(expect.anything());
      expect(endpointHandler.close).not.toHaveBeenCalled();

      const termHandler = jest.mocked(endpointHandler.addTerminationHandler).mock.calls[0][0];
      termHandler('myProcess');

      expect(context.closeExperiment).toHaveBeenCalledTimes(1);

      breakpointBarrierResolver();
      await experimentEnd;

      expect(endpointHandler.close).toHaveBeenCalledWith();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalledWith();

      expect(dirsOut).toEqual({
        'CWD/output': true,
      });
    });

    it('should run the experiment with query filter', async() => {
      await experiment.run({ ...context, filter: 'C1' });

      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith({ ...context, filter: 'C1' });
      expect(endpointHandler.startCollectingStats).toHaveBeenCalledWith();
      expect(sparqlBenchmarkRun).toHaveBeenCalledWith(expect.anything());
      expect(endpointHandler.close).toHaveBeenCalledWith();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalledWith();

      expect(resultSerializerSerialize).toHaveBeenCalledWith(
        Path.normalize('CWD/output/query-times.csv'),
        {},
      );
      expect(resultSerializerRawSerialize).toHaveBeenCalledWith(
        Path.normalize('CWD/output/query-results-raw.json'),
        {},
      );

      expect(dirsOut).toEqual({
        'CWD/output': true,
      });

      expect(SparqlBenchmarkRunner).toHaveBeenCalledWith(expect.objectContaining({
        querySets: { C1: 'path/C1' },
      }));
    });
  });

  describe('clean', () => {
    it('should clean without targets', async() => {
      await experiment.clean(context, {});

      expect(hookSparqlEndpoint.clean).toHaveBeenCalledWith(context, {});
    });
  });
});
