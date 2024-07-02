import Path from 'path';
import type { Hook, ITaskContext, ProcessHandler } from 'jbr';
import { createExperimentPaths } from 'jbr';
import { SparqlBenchmarkRunner } from 'sparql-benchmark-runner';
import { TestLogger } from '../../jbr/test/TestLogger';
import { ExperimentSparqlCustom } from '../lib/ExperimentSparqlCustom';

let sparqlBenchmarkRun: any;
let resultSerializerSerialize: any;
jest.mock('sparql-benchmark-runner', () => ({
  SparqlBenchmarkRunner: jest.fn().mockImplementation((options: any) => {
    options.logger('Test logger');
    return {
      run: sparqlBenchmarkRun,
      endpointFetcher: {},
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

describe('ExperimentSparqlCustom', () => {
  let context: ITaskContext;
  let hookSparqlEndpoint: Hook;
  let endpointHandlerStopCollectingStats: any;
  let endpointHandler: ProcessHandler;
  let experiment: ExperimentSparqlCustom;
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
    sparqlBenchmarkRun = jest.fn(async({ onStart, onQuery, onStop }) => {
      await onStart();
      await onQuery(`# Airports in Italy
# Datasource: https://fragments.dbpedia.org/2016-04/en
SELECT DISTINCT ?entity WHERE {
  ?entity a dbpedia-owl:Airport;
          dbpprop:cityServed dbpedia:Italy.
}`);
      await onStop();
    });
    resultSerializerSerialize = jest.fn();
    experiment = new ExperimentSparqlCustom(
      'input/queries/',
      hookSparqlEndpoint,
      'http://localhost:3001/sparql',
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
    (<any> process).on = jest.fn();
  });

  describe('prepare', () => {
    it('should prepare the experiment', async() => {
      await experiment.prepare(context, false);
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
      // eslint-disable-next-line unicorn/no-useless-undefined
      expect(resultSerializerSerialize).toHaveBeenCalledWith(Path.normalize('CWD/output/query-times.csv'), undefined);

      expect(dirsOut).toEqual({
        'CWD/output': true,
      });

      expect(SparqlBenchmarkRunner).toHaveBeenCalledWith(expect.objectContaining({
        querySets: {
          C1: 'path/C1',
          C2: 'path/C2',
          C3: 'path/C3',
        },
      }));
    });

    it('should run the experiment with queryRunnerUrlParams', async() => {
      experiment = new ExperimentSparqlCustom(
        'input/queries/',
        hookSparqlEndpoint,
        'http://localhost:3001/sparql',
        3,
        1,
        0,
        1_000,
        { context: `{ "lenient": true }` },
        600,
      );

      await experiment.run(context);

      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith(context);
      expect(endpointHandler.startCollectingStats).toHaveBeenCalled();
      expect(sparqlBenchmarkRun).toHaveBeenCalled();
      expect(endpointHandler.close).toHaveBeenCalled();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalled();
      // eslint-disable-next-line unicorn/no-useless-undefined
      expect(resultSerializerSerialize).toHaveBeenCalledWith(Path.normalize('CWD/output/query-times.csv'), undefined);

      expect(dirsOut).toEqual({
        'CWD/output': true,
      });

      expect(SparqlBenchmarkRunner).toHaveBeenCalledWith(expect.objectContaining({
        querySets: {
          C1: 'path/C1',
          C2: 'path/C2',
          C3: 'path/C3',
        },
      }));
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

    it('should run the experiment with query filter', async() => {
      await experiment.run({ ...context, filter: 'C1' });

      expect(hookSparqlEndpoint.start).toHaveBeenCalledWith({ ...context, filter: 'C1' });
      expect(endpointHandler.startCollectingStats).toHaveBeenCalled();
      expect(sparqlBenchmarkRun).toHaveBeenCalled();
      expect(endpointHandler.close).toHaveBeenCalled();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalled();
      // eslint-disable-next-line unicorn/no-useless-undefined
      expect(resultSerializerSerialize).toHaveBeenCalledWith(Path.normalize('CWD/output/query-times.csv'), undefined);

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

  describe('getQuerySources', () => {
    it('handles an empty query', () => {
      expect(experiment.getQuerySources('')).toEqual(undefined);
    });

    it('handles a valid query with datasource', () => {
      expect(experiment.getQuerySources(`# Airports in Italy
# Datasource: https://fragments.dbpedia.org/2016-04/en
SELECT DISTINCT ?entity WHERE {
  ?entity a dbpedia-owl:Airport;
          dbpprop:cityServed dbpedia:Italy.
}
`)).toEqual([ 'https://fragments.dbpedia.org/2016-04/en' ]);
    });

    it('handles a valid query with datasources', () => {
      expect(experiment.getQuerySources(`# Datasources: https://fragments.dbpedia.org/2016-04/en http://data.linkeddatafragments.org/viaf http://data.linkeddatafragments.org/harvard
SELECT ?person ?name ?book ?title {
  ?person dbpedia-owl:birthPlace [ rdfs:label "San Francisco"@en ].
  ?viafID schema:sameAs ?person;
               schema:name ?name.
  ?book dc:contributor [ foaf:name ?name ];
              dc:title ?title.
} LIMIT 100
`)).toEqual([
        'https://fragments.dbpedia.org/2016-04/en',
        'http://data.linkeddatafragments.org/viaf',
        'http://data.linkeddatafragments.org/harvard',
      ]);
    });
  });
});
