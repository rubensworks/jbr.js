import * as os from 'node:os';
import * as Path from 'node:path';
import * as fs from 'fs-extra';
import type { Hook, ITaskContext, ProcessHandler } from 'jbr';
import { createExperimentPaths } from 'jbr';
import { QueryLoaderFile, SparqlBenchmarkRunner } from 'sparql-benchmark-runner';
import { TestLogger } from '../../jbr/test/TestLogger';
import { DatasetSampler } from '../lib/DatasetSampler';
import { ExperimentLargeRdfBench } from '../lib/ExperimentLargeRdfBench';
import { LineageComputer } from '../lib/LineageComputer';
import { SampleValidator } from '../lib/SampleValidator';
import { ZenodoArchive } from '../lib/ZenodoArchive';

let zenodoFiles: Record<string, Record<string, string>>;
jest.mock<any>('../lib/ZenodoArchive', () => ({
  ZenodoArchive: jest.fn().mockImplementation((_record: string, name: string) => ({
    async extract(filter: (fileName: string) => boolean, target: string, log: (message: string) => void) {
      log(`  Extracting ${name}`);
      const extracted: string[] = [];
      for (const [ fileName, contents ] of Object.entries(zenodoFiles[name])) {
        if (filter(fileName)) {
          extracted.push(fileName);
          await fs.outputFile(Path.join(target, fileName), contents);
        }
      }
      return extracted;
    },
  })),
}));

let lineageStats: Record<string, any>;
jest.mock<any>('../lib/LineageComputer', () => ({
  LineageComputer: jest.fn().mockImplementation(() => ({
    computeAll: jest.fn(async() => lineageStats),
  })),
}));

jest.mock<any>('../lib/DatasetSampler', () => ({
  DatasetSampler: jest.fn().mockImplementation((options: any) => ({
    async sampleAll() {
      for (const ds of Object.keys(options.documents)) {
        await fs.outputFile(Path.join(options.outputDirectory, `${ds}.nt`), `<ex:${ds}> <ex:p> "o" .\n`);
      }
      return {
        datasets: { A: { sampleTriples: 1 }, B: { sampleTriples: 2 }},
        patterns: [{ pattern: '? <ex:p> ?', full: { A: 1 }, sample: { A: 1 }}],
      };
    },
  })),
}));

let validationReport: Record<string, any>;
jest.mock<any>('../lib/SampleValidator', () => ({
  SampleValidator: jest.fn().mockImplementation(() => ({
    validateAll: jest.fn(async() => validationReport),
  })),
}));

let hdtDocuments: any[];
jest.mock<any>('hdt', () => ({
  fromFile: jest.fn(async(path: string) => {
    const document = { path, close: jest.fn() };
    hdtDocuments.push(document);
    return document;
  }),
}));

jest.mock<any>('@comunica/query-sparql-hdt', () => ({
  QueryEngine: jest.fn().mockImplementation(() => ({ type: 'hdt' })),
}));

jest.mock<any>('@comunica/query-sparql-rdfjs', () => ({
  QueryEngine: jest.fn().mockImplementation(() => ({ type: 'rdfjs' })),
}));

let sparqlBenchmarkRun: any;
let resultSerializerSerialize: any;
let resultSerializerRawSerialize: any;
jest.mock<any>('sparql-benchmark-runner', () => ({
  SparqlBenchmarkRunner: jest.fn().mockImplementation((options: any) => {
    options.logger('Test logger');
    return { runWithRawResults: sparqlBenchmarkRun };
  }),
  QueryLoaderFile: jest.fn().mockImplementation(() => ({
    loadQueries: jest.fn().mockResolvedValue({ C1: [ 'Q1' ], S1: [ 'Q2' ]}),
  })),
  ResultSerializerCsv: jest.fn().mockImplementation(() => ({
    serialize: resultSerializerSerialize,
  })),
  ResultSerializerRaw: jest.fn().mockImplementation(() => ({
    serialize: resultSerializerRawSerialize,
  })),
}));

function createHook(processHandler?: ProcessHandler): Hook {
  return {
    prepare: jest.fn(),
    start: jest.fn(async() => processHandler!),
    clean: jest.fn(),
  };
}

function createProcessHandler(order: string[], name: string): ProcessHandler {
  return <any> {
    close: jest.fn(async() => {
      order.push(`close ${name}`);
    }),
    join: jest.fn(),
    startCollectingStats: jest.fn(async() => () => order.push(`stop stats ${name}`)),
    addTerminationHandler: jest.fn(),
    removeTerminationHandler: jest.fn(),
  };
}

describe('ExperimentLargeRdfBench', () => {
  let directory: string;
  let context: ITaskContext;
  let hookSparqlEndpoint: Hook;
  let hookSources: Hook[];

  function createExperiment(options: { sample?: boolean; validate?: boolean } = {}): ExperimentLargeRdfBench {
    return new ExperimentLargeRdfBench(
      '123',
      [ 'A', 'B' ],
      [ 'C2', 'S1', 'S7' ],
      options.sample ?? true,
      { B: 0.5 },
      0.2,
      'seed',
      options.validate ?? true,
      60,
      hookSparqlEndpoint,
      hookSources,
      'http://localhost:3001/sparql',
      undefined,
      undefined,
      3,
      1,
      0,
      1_000,
      { a: 'b' },
      undefined,
    );
  }

  const generated = (...parts: string[]): string => Path.join(directory, 'generated', ...parts);

  beforeEach(async() => {
    directory = await fs.mkdtemp(Path.join(os.tmpdir(), 'jbr-largerdfbench-experiment-'));
    context = {
      cwd: directory,
      experimentPaths: createExperimentPaths(directory),
      experimentName: 'EXP',
      mainModulePath: 'MMP',
      verbose: true,
      closeExperiment: jest.fn(),
      cleanupHandlers: [],
      logger: <any> new TestLogger(),
      docker: <any> {},
    };
    hookSparqlEndpoint = createHook();
    hookSources = [ createHook(), createHook() ];
    zenodoFiles = {
      'hdt_datasets.zip': { 'A.hdt': 'A', 'A.hdt.index.v1-1': 'Ai', 'B.hdt': 'B', 'C.hdt': 'C' },
      'queries.zip': {
        'C2.sparql': 'SELECT * WHERE {\n\n  ?s ?p ?o\n}\n',
        'S1.sparql': 'SELECT * WHERE { ?s ?p ?o }',
        'S7.sparql': 'SELECT * WHERE { ?s ?p ?o }',
        'X.sparql': 'SELECT * WHERE { ?s ?p ?o }',
      },
      'results.zip': {
        'S1.srj': JSON.stringify({
          head: { vars: [ 'a' ]},
          results: { bindings: [{ a: { type: 'uri', value: 'ex:1' }}]},
        }),
        'S7.srj': JSON.stringify({ head: { vars: [ 'a' ]}, results: { bindings: []}}),
        'S7_complete.srj': JSON.stringify({ head: { vars: [ 'a' ]}, results: { bindings: [{}, {}]}}),
      },
    };
    lineageStats = { S1: { unmatchedRows: [{ a: '<ex:1>' }], solutions: 1 }};
    validationReport = { C2: { ok: true }, S1: { ok: true }, S7: { ok: true }};
    hdtDocuments = [];
    jest.clearAllMocks();
  });

  afterEach(async() => {
    await fs.remove(directory);
  });

  describe('constructor', () => {
    it('defaults the external endpoint URL and source URLs', () => {
      const experiment = createExperiment();
      expect(experiment.endpointUrlExternal).toBe('http://localhost:3001/sparql');
      expect(experiment.sourceUrlsExternal).toEqual([]);
    });
  });

  describe('prepare', () => {
    it('skips if all generated files exist', async() => {
      for (const file of [
        'manifest.json',
        'datasets/A.nt',
        'datasets/B.nt',
        'queries/C2.sparql',
        'queries/S1.sparql',
        'queries/S7.sparql',
      ]) {
        await fs.outputFile(generated(file), '');
      }
      await createExperiment().prepare(context, false);
      expect(hookSparqlEndpoint.prepare).toHaveBeenCalledWith(context, false);
      expect(hookSources[0].prepare).toHaveBeenCalledWith(context, false);
      expect(hookSources[1].prepare).toHaveBeenCalledWith(context, false);
      await expect(fs.pathExists(Path.join(directory, 'output', 'logs'))).resolves.toBe(true);
      expect(ZenodoArchive).not.toHaveBeenCalled();
    });

    it('generates a validated sample', async() => {
      await createExperiment().prepare(context, false);

      expect(ZenodoArchive).toHaveBeenCalledWith('123', 'hdt_datasets.zip');
      await expect(fs.readdir(generated('zenodo', 'hdt'))).resolves.toEqual([ 'A.hdt', 'A.hdt.index.v1-1', 'B.hdt' ]);
      await expect(fs.readFile(generated('queries', 'C2.sparql'), 'utf8')).resolves
        .toBe('SELECT * WHERE {\n  ?s ?p ?o\n}\n');
      await expect(fs.readdir(generated('queries'))).resolves.toEqual([ 'C2.sparql', 'S1.sparql', 'S7.sparql' ]);

      const lineageOptions = jest.mocked(LineageComputer).mock.calls[0][0];
      expect(lineageOptions.engine).toEqual({ type: 'hdt' });
      expect(lineageOptions.engineContext).toEqual({
        sources: [
          { type: 'hdt', value: generated('zenodo', 'hdt', 'A.hdt') },
          { type: 'hdt', value: generated('zenodo', 'hdt', 'B.hdt') },
        ],
      });
      expect(Object.keys(lineageOptions.documents)).toEqual([ 'A', 'B' ]);
      expect(Object.keys(lineageOptions.queries)).toEqual([ 'C2', 'S1', 'S7' ]);
      expect(Object.keys(lineageOptions.evaluationQueries)).toEqual([ 'C2' ]);
      expect(lineageOptions.evaluationQueries.C2).toContain('?inchi');
      expect(lineageOptions.publishedResults.S1!.results.bindings).toHaveLength(1);
      expect(lineageOptions.publishedResults.S7!.results.bindings).toHaveLength(2);
      expect(lineageOptions.publishedResults.C2).toBeUndefined();
      expect(lineageOptions.limitCandidates).toBe(ExperimentLargeRdfBench.LIMIT_CANDIDATES);
      expect(lineageOptions.timeoutSeconds).toBe(60);
      lineageOptions.log('message');

      const samplerOptions = jest.mocked(DatasetSampler).mock.calls[0][0];
      expect(samplerOptions).toMatchObject({
        subjectRates: { B: 0.5 },
        otherTriplesRate: 0.2,
        seed: 'seed',
        lineageDirectory: generated('lineage'),
        outputDirectory: generated('datasets'),
      });
      expect(samplerOptions.queries).toHaveLength(3);

      const validatorOptions = jest.mocked(SampleValidator).mock.calls[0][0];
      expect(validatorOptions.sampleEngine).toEqual({ type: 'rdfjs' });
      expect(validatorOptions.sampleContext.sources.map((store: any) => store.size)).toEqual([ 1, 1 ]);
      expect(validatorOptions.fullEngine).toEqual({ type: 'hdt' });
      expect(validatorOptions.resultsDirectory).toBe(generated('results'));

      expect(JSON.parse(await fs.readFile(generated('manifest.json'), 'utf8'))).toEqual({
        source: 'https://zenodo.org/records/123',
        sample: true,
        queries: [ 'C2', 'S1', 'S7' ],
        seed: 'seed',
        subjectRates: { B: 0.5 },
        otherTriplesRate: 0.2,
        datasets: { A: { sampleTriples: 1 }, B: { sampleTriples: 2 }},
        sampleTriples: 3,
        patterns: [{ pattern: '? <ex:p> ?', full: { A: 1 }, sample: { A: 1 }}],
        lineage: { S1: { unmatchedRows: 1, solutions: 1 }},
        validation: validationReport,
      });
      expect(hdtDocuments.map(document => document.close.mock.calls.length)).toEqual([ 1, 1 ]);
    });

    it('fails if the sample does not validate, and closes the HDT documents', async() => {
      validationReport.S1.ok = false;
      validationReport.S7.ok = false;
      await expect(createExperiment().prepare(context, false)).rejects
        .toThrow('The sample does not produce the same results as the full data for S1, S7');
      expect(hdtDocuments.map(document => document.close.mock.calls.length)).toEqual([ 1, 1 ]);
    });

    it('generates a sample without validation, using the published results', async() => {
      await createExperiment({ validate: false }).prepare(context, false);
      expect(SampleValidator).not.toHaveBeenCalled();
      await expect(fs.readdir(generated('results'))).resolves.toEqual([ 'S1.srj', 'S7.srj' ]);
      expect(JSON.parse(await fs.readFile(generated('results', 'S7.srj'), 'utf8')).results.bindings).toHaveLength(2);
      expect(JSON.parse(await fs.readFile(generated('manifest.json'), 'utf8')).validation).toBeUndefined();
    });

    it('prepares the full datasets', async() => {
      await createExperiment({ sample: false }).prepare(context, false);
      await expect(fs.readdir(generated('datasets'))).resolves.toEqual([ 'A.hdt', 'A.hdt.index.v1-1', 'B.hdt' ]);
      expect(LineageComputer).not.toHaveBeenCalled();
      await expect(fs.readdir(generated('results'))).resolves.toEqual([ 'S1.srj', 'S7.srj' ]);
      expect(JSON.parse(await fs.readFile(generated('manifest.json'), 'utf8'))).toEqual({
        source: 'https://zenodo.org/records/123',
        sample: false,
        queries: [ 'C2', 'S1', 'S7' ],
      });
    });

    it('regenerates existing files if forced', async() => {
      for (const file of [
        'manifest.json',
        'datasets/A.hdt',
        'datasets/B.hdt',
        'queries/C2.sparql',
        'queries/S1.sparql',
        'queries/S7.sparql',
      ]) {
        await fs.outputFile(generated(file), '');
      }
      await createExperiment({ sample: false }).prepare(context, true);
      expect(ZenodoArchive).toHaveBeenCalledTimes(3);
    });
  });

  describe('run', () => {
    let order: string[];
    let experiment: ExperimentLargeRdfBench;

    beforeEach(() => {
      order = [];
      hookSparqlEndpoint = createHook(createProcessHandler(order, 'engine'));
      hookSources = [ createHook(createProcessHandler(order, 'A')), createHook(createProcessHandler(order, 'B')) ];
      experiment = new ExperimentLargeRdfBench('123', [ 'A', 'B' ], [ 'C1', 'S1' ], true, {}, 0.2, 'seed', true, 60, hookSparqlEndpoint, hookSources, 'http://localhost:3001/sparql', 'http://localhost:3001/', [ 'http://localhost:4001/sparql' ], 3, 1, 0, 1_000, { a: 'b' }, 30);
      jest.spyOn(experiment.httpAvailabilityLatch, 'sleepUntilAvailable')
        .mockImplementation(async(_context, url) => {
          order.push(`wait ${url}`);
        });
      sparqlBenchmarkRun = jest.fn(async({ onStart, onStop }) => {
        await onStart();
        await onStop();
        return { aggregateResults: 'AGGREGATE', rawResults: 'RAW' };
      });
      resultSerializerSerialize = jest.fn();
      resultSerializerRawSerialize = jest.fn();
    });

    it('starts the sources one by one, and the federation engine, and runs the queries', async() => {
      const breakpointBarrier = jest.fn(async() => {
        order.push('breakpoint');
      });
      await experiment.run(<any> { ...context, filter: '^S', breakpointBarrier });

      expect(order).toEqual([
        'wait http://localhost:4001/sparql',
        'wait http://localhost:3001/',
        'breakpoint',
        'stop stats A',
        'stop stats B',
        'stop stats engine',
        'close engine',
        'close B',
        'close A',
      ]);
      await expect(fs.readFile(Path.join(directory, 'output', 'logs', 'load-time.csv'), 'utf8')).resolves
        .toMatch(/^time\n\d+$/u);
      expect(QueryLoaderFile).toHaveBeenCalledWith({
        path: Path.join(directory, 'generated', 'queries'),
        extensions: [ '.sparql' ],
      });
      expect(SparqlBenchmarkRunner).toHaveBeenCalledWith(expect.objectContaining({
        endpoint: 'http://localhost:3001/sparql',
        endpointUpCheck: 'http://localhost:3001/',
        querySets: { S1: [ 'Q2' ]},
        replication: 3,
        warmup: 1,
        additionalUrlParams: new URLSearchParams({ a: 'b' }),
        timeout: 30,
        recoveryQuery: 'ASK { ?s ?p ?o }',
      }));
      expect(resultSerializerSerialize)
        .toHaveBeenCalledWith(Path.join(directory, 'output', 'query-times.csv'), 'AGGREGATE');
      expect(resultSerializerRawSerialize)
        .toHaveBeenCalledWith(Path.join(directory, 'output', 'query-results-raw.json'), 'RAW');
    });

    it('creates the output directory, and handles missing raw results', async() => {
      sparqlBenchmarkRun = jest.fn(async({ onStart, onStop }) => {
        await onStart();
        await onStop();
        return { aggregateResults: 'AGGREGATE' };
      });
      await experiment.run(<any> context);
      await expect(fs.pathExists(Path.join(directory, 'output', 'logs', 'load-time.csv'))).resolves.toBe(true);
      expect(resultSerializerRawSerialize).not.toHaveBeenCalled();
      expect(SparqlBenchmarkRunner)
        .toHaveBeenCalledWith(expect.objectContaining({ querySets: { C1: [ 'Q1' ], S1: [ 'Q2' ]}}));
    });
  });

  describe('clean', () => {
    it('cleans all hooks', async() => {
      await createExperiment().clean(context, { docker: true });
      expect(hookSparqlEndpoint.clean).toHaveBeenCalledWith(context, { docker: true });
      expect(hookSources[0].clean).toHaveBeenCalledWith(context, { docker: true });
      expect(hookSources[1].clean).toHaveBeenCalledWith(context, { docker: true });
    });
  });
});
