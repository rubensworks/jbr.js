import * as Path from 'node:path';
import * as fs from 'fs-extra';
import { HttpAvailabilityLatch, ProcessHandlerComposite, secureProcessHandler } from 'jbr';
import type { Experiment, Hook, ICleanTargets, ITaskContext, IRunTaskContext, ProcessHandler } from 'jbr';
import { StreamParser } from 'n3';
import { RdfStore } from 'rdf-stores';
import type { IResultSerializer } from 'sparql-benchmark-runner';
import {
  QueryLoaderFile,
  ResultSerializerCsv,
  ResultSerializerRaw,
  SparqlBenchmarkRunner,
} from 'sparql-benchmark-runner';
import { DatasetSampler } from './DatasetSampler';
import type { IHdtDocumentLike, ILimitCandidates, IQueryEngineLike, ISparqlJsonResults } from './LineageComputer';
import { LineageComputer } from './LineageComputer';
import { SampleValidator } from './SampleValidator';
import { ZenodoArchive } from './ZenodoArchive';

/**
 * The paths of the generated files.
 */
export interface ILargeRdfBenchPaths {
  generated: string;
  zenodoHdt: string;
  zenodoQueries: string;
  zenodoResults: string;
  lineage: string;
  datasets: string;
  queries: string;
  results: string;
  manifest: string;
}

/**
 * An experiment instance for LargeRDFBench, a benchmark for SPARQL endpoint federation,
 * using either its full datasets, or a sample of them over which the queries produce the same results.
 */
export class ExperimentLargeRdfBench implements Experiment {
  public static readonly TEMPLATES_PATH = Path.join(__dirname, 'templates');
  /**
   * The 9 datasets that originate from FedBench.
   */
  public static readonly FEDBENCH_DATASETS = [
    'ChEBI',
    'DBPedia-Subset',
    'DrugBank',
    'GeoNames',
    'Jamendo',
    'KEGG',
    'LMDB',
    'NYT',
    'SWDFood',
  ];

  /**
   * The 23 queries that only use the FedBench datasets.
   */
  public static readonly FEDBENCH_QUERIES = [
    'S1',
    'S2',
    'S3',
    'S4',
    'S5',
    'S6',
    'S7',
    'S8',
    'S9',
    'S10',
    'S11',
    'S12',
    'S13',
    'S14',
    'C1',
    'C2',
    'C3',
    'C4',
    'C5',
    'C6',
    'C7',
    'C8',
    'C9',
  ];

  /**
   * Queries whose original form Comunica evaluates too slowly to generate a sample,
   * mapped to an equivalent formulation in the templates directory.
   */
  public static readonly EQUIVALENT_QUERIES: Record<string, string> = {
    C2: 'equivalent-queries/C2.sparql',
    C5: 'equivalent-queries/C5.sparql',
  };

  /**
   * LIMIT queries whose full result is too expensive to compute, with candidate values for one of their variables.
   */
  public static readonly LIMIT_CANDIDATES: Record<string, ILimitCandidates> = {
    C4: { variable: 'NYTplace', predicate: 'http://www.geonames.org/ontology#population', batchSize: 2_000 },
  };

  public readonly httpAvailabilityLatch = new HttpAvailabilityLatch();
  public readonly zenodoRecord: string;
  public readonly datasets: string[];
  public readonly queries: string[];
  public readonly sample: boolean;
  public readonly sampleSubjectRates: Record<string, number>;
  public readonly sampleOtherTriplesRate: number;
  public readonly sampleSeed: string;
  public readonly sampleValidate: boolean;
  public readonly generationQueryTimeout: number;
  public readonly hookSparqlEndpoint: Hook;
  public readonly hookSparqlEndpointSources: Hook[];
  public readonly endpointUrl: string;
  public readonly endpointUrlExternal: string;
  public readonly sourceUrlsExternal: string[];
  public readonly queryRunnerReplication: number;
  public readonly queryRunnerWarmupRounds: number;
  public readonly queryRunnerRequestDelay: number;
  public readonly queryRunnerEndpointAvailabilityCheckTimeout: number;
  public readonly queryRunnerUrlParams: Record<string, any>;
  public readonly queryTimeoutFallback: number | undefined;

  /**
   * @param zenodoRecord - The Zenodo record of the LargeRDFBench Interoperable Edition to download from.
   * @param datasets - The datasets to include, by their name in the Zenodo record.
   * @param queries - The queries to include, by their name in the Zenodo record.
   * @param sample - If the datasets must be sampled. Otherwise, the full datasets are used, as HDT files.
   * @param sampleSubjectRates - The fraction of subjects to sample per dataset, which defaults to 1. @range {json}
   * @param sampleOtherTriplesRate - The fraction of the triples of sampled subjects that match no query pattern to
   *                                 keep. @range {double}
   * @param sampleSeed - The seed for sampling.
   * @param sampleValidate - If the queries must be validated to produce the same results over the sample as over the
   *                         full data.
   * @param generationQueryTimeout - The timeout in seconds of the queries over the full data during sampling.
   * @param hookSparqlEndpoint - The SPARQL endpoint of the federation engine that is benchmarked.
   * @param hookSparqlEndpointSources - The SPARQL endpoints of the datasets, which are started one by one.
   * @param endpointUrl - The URL of the SPARQL endpoint of the federation engine.
   * @param endpointUrlExternal - The URL to check if the SPARQL endpoint of the federation engine is available.
   * @param sourceUrlsExternal - The URLs to check if each source is available before starting the next one.
   * @param queryRunnerReplication - The number of replication runs.
   * @param queryRunnerWarmupRounds - The number of warmup runs.
   * @param queryRunnerRequestDelay - The delay between requests in milliseconds.
   * @param queryRunnerEndpointAvailabilityCheckTimeout - The timeout of the availability check in milliseconds.
   * @param queryRunnerUrlParams - URL parameters to pass to the SPARQL endpoint. @range {json}
   * @param queryTimeoutFallback - A timeout in milliseconds for a single query, as fallback for the endpoint's timeout.
   */
  public constructor(
    zenodoRecord: string,
    datasets: string[],
    queries: string[],
    sample: boolean,
    sampleSubjectRates: Record<string, number>,
    sampleOtherTriplesRate: number,
    sampleSeed: string,
    sampleValidate: boolean,
    generationQueryTimeout: number,
    hookSparqlEndpoint: Hook,
    hookSparqlEndpointSources: Hook[],
    endpointUrl: string,
    endpointUrlExternal: string | undefined,
    sourceUrlsExternal: string[] | undefined,
    queryRunnerReplication: number,
    queryRunnerWarmupRounds: number,
    queryRunnerRequestDelay: number,
    queryRunnerEndpointAvailabilityCheckTimeout: number,
    queryRunnerUrlParams: Record<string, any>,
    queryTimeoutFallback: number | undefined,
  ) {
    this.zenodoRecord = zenodoRecord;
    this.datasets = datasets;
    this.queries = queries;
    this.sample = sample;
    this.sampleSubjectRates = sampleSubjectRates;
    this.sampleOtherTriplesRate = sampleOtherTriplesRate;
    this.sampleSeed = sampleSeed;
    this.sampleValidate = sampleValidate;
    this.generationQueryTimeout = generationQueryTimeout;
    this.hookSparqlEndpoint = hookSparqlEndpoint;
    this.hookSparqlEndpointSources = hookSparqlEndpointSources;
    this.endpointUrl = endpointUrl;
    this.endpointUrlExternal = endpointUrlExternal ?? endpointUrl;
    this.sourceUrlsExternal = sourceUrlsExternal ?? [];
    this.queryRunnerReplication = queryRunnerReplication;
    this.queryRunnerWarmupRounds = queryRunnerWarmupRounds;
    this.queryRunnerRequestDelay = queryRunnerRequestDelay;
    this.queryRunnerEndpointAvailabilityCheckTimeout = queryRunnerEndpointAvailabilityCheckTimeout;
    this.queryRunnerUrlParams = queryRunnerUrlParams;
    this.queryTimeoutFallback = queryTimeoutFallback;
  }

  /**
   * The paths of the generated files.
   * @param generated The generated directory.
   */
  public static getPaths(generated: string): ILargeRdfBenchPaths {
    return {
      generated,
      zenodoHdt: Path.join(generated, 'zenodo', 'hdt'),
      zenodoQueries: Path.join(generated, 'zenodo', 'queries'),
      zenodoResults: Path.join(generated, 'zenodo', 'results'),
      lineage: Path.join(generated, 'lineage'),
      datasets: Path.join(generated, 'datasets'),
      queries: Path.join(generated, 'queries'),
      results: Path.join(generated, 'results'),
      manifest: Path.join(generated, 'manifest.json'),
    };
  }

  /**
   * The path of a dataset that the sources serve: an N-Triples file for a sample, or an HDT file for the full data.
   * @param paths The paths of the generated files.
   * @param dataset A dataset name.
   */
  public getDatasetPath(paths: ILargeRdfBenchPaths, dataset: string): string {
    return Path.join(paths.datasets, `${dataset}.${this.sample ? 'nt' : 'hdt'}`);
  }

  public async prepare(context: ITaskContext, forceOverwriteGenerated: boolean): Promise<void> {
    const paths = ExperimentLargeRdfBench.getPaths(context.experimentPaths.generated);

    // Prepare hooks
    await this.hookSparqlEndpoint.prepare(context, forceOverwriteGenerated);
    for (const hook of this.hookSparqlEndpointSources) {
      await hook.prepare(context, forceOverwriteGenerated);
    }

    // Ensure logs directory exists
    await fs.ensureDir(Path.join(context.experimentPaths.output, 'logs'));

    // The generated files may have been obtained elsewhere, such as a pre-built sample.
    context.logger.info(`Preparing LargeRDFBench ${this.sample ? 'sample' : 'datasets'}, queries, and results`);
    if (!forceOverwriteGenerated && await this.isGenerated(paths)) {
      context.logger.info(`  Skipped`);
      return;
    }

    // Download the HDT files, queries, and published results
    context.logger.info(`Downloading LargeRDFBench from Zenodo record ${this.zenodoRecord}`);
    const log = (message: string): void => {
      context.logger.info(message);
    };
    const hdtFiles = new Set(this.datasets.flatMap(dataset => [ `${dataset}.hdt`, `${dataset}.hdt.index.v1-1` ]));
    await new ZenodoArchive(this.zenodoRecord, 'hdt_datasets.zip')
      .extract(fileName => hdtFiles.has(fileName), this.sample ? paths.zenodoHdt : paths.datasets, log);
    await new ZenodoArchive(this.zenodoRecord, 'queries.zip')
      .extract(fileName => fileName.endsWith('.sparql'), paths.zenodoQueries, log);
    await new ZenodoArchive(this.zenodoRecord, 'results.zip')
      .extract(fileName => fileName.endsWith('.srj'), paths.zenodoResults, log);

    // Write the queries, without blank lines, as sparql-benchmark-runner separates queries in a file by blank lines.
    const queries = await this.readQueries(paths);
    await fs.ensureDir(paths.queries);
    for (const [ id, query ] of Object.entries(queries)) {
      const lines = query.split('\n').filter(line => line.trim().length > 0);
      await fs.writeFile(Path.join(paths.queries, `${id}.sparql`), `${lines.join('\n')}\n`, 'utf8');
    }

    const publishedResults = await this.readPublishedResults(paths);
    if (this.sample) {
      await this.generateSample(context, paths, queries, publishedResults);
    } else {
      // The published results are used as expected results.
      await this.writePublishedResults(paths, publishedResults);
      await this.writeManifest(paths, {});
    }
  }

  /**
   * Check if all generated files that are needed to run the experiment exist.
   * @param paths The paths of the generated files.
   */
  public async isGenerated(paths: ILargeRdfBenchPaths): Promise<boolean> {
    const files = [
      paths.manifest,
      ...this.datasets.map(dataset => this.getDatasetPath(paths, dataset)),
      ...this.queries.map(id => Path.join(paths.queries, `${id}.sparql`)),
    ];
    for (const file of files) {
      if (!await fs.pathExists(file)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Read the downloaded queries.
   * @param paths The paths of the generated files.
   */
  public async readQueries(paths: ILargeRdfBenchPaths): Promise<Record<string, string>> {
    const queries: Record<string, string> = {};
    for (const id of this.queries) {
      queries[id] = await fs.readFile(Path.join(paths.zenodoQueries, `${id}.sparql`), 'utf8');
    }
    return queries;
  }

  /**
   * Read the downloaded published results, preferring their corrected (complete) versions.
   * @param paths The paths of the generated files.
   */
  public async readPublishedResults(paths: ILargeRdfBenchPaths): Promise<Record<string, ISparqlJsonResults>> {
    const results: Record<string, ISparqlJsonResults> = {};
    for (const id of this.queries) {
      for (const file of [ `${id}_complete.srj`, `${id}.srj` ]) {
        const path = Path.join(paths.zenodoResults, file);
        if (await fs.pathExists(path)) {
          results[id] = <ISparqlJsonResults> JSON.parse(await fs.readFile(path, 'utf8'));
          break;
        }
      }
    }
    return results;
  }

  /**
   * Write the published results as expected results.
   * @param paths The paths of the generated files.
   * @param publishedResults The published results.
   */
  public async writePublishedResults(
    paths: ILargeRdfBenchPaths,
    publishedResults: Record<string, ISparqlJsonResults>,
  ): Promise<void> {
    await fs.ensureDir(paths.results);
    for (const [ id, results ] of Object.entries(publishedResults)) {
      await fs.writeFile(Path.join(paths.results, `${id}.srj`), JSON.stringify(results), 'utf8');
    }
  }

  /**
   * Read the equivalent formulations of the queries that have one.
   */
  public async readEquivalentQueries(): Promise<Record<string, string>> {
    const queries: Record<string, string> = {};
    for (const id of this.queries) {
      const file = ExperimentLargeRdfBench.EQUIVALENT_QUERIES[id];
      if (file) {
        queries[id] = await fs.readFile(Path.join(ExperimentLargeRdfBench.TEMPLATES_PATH, file), 'utf8');
      }
    }
    return queries;
  }

  /**
   * Generate the sampled datasets, the expected results, and the manifest.
   * @param context The task context.
   * @param paths The paths of the generated files.
   * @param queries The queries.
   * @param publishedResults The published results.
   */
  public async generateSample(
    context: ITaskContext,
    paths: ILargeRdfBenchPaths,
    queries: Record<string, string>,
    publishedResults: Record<string, ISparqlJsonResults>,
  ): Promise<void> {
    const log = (message: string): void => {
      context.logger.info(message);
    };

    // These are only loaded when generating a sample, as hdt is a native module.
    const { hdt, QueryEngineHdt, QueryEngineRdfJs } = await ExperimentLargeRdfBench.loadGenerationModules();

    const documents: Record<string, IHdtDocumentLike & { close: () => Promise<void> }> = {};
    for (const dataset of this.datasets) {
      documents[dataset] = await hdt.fromFile(Path.join(paths.zenodoHdt, `${dataset}.hdt`));
    }
    try {
      const fullEngine = new QueryEngineHdt();
      const fullContext = {
        sources: this.datasets.map(dataset => ({ type: 'hdt', value: Path.join(paths.zenodoHdt, `${dataset}.hdt`) })),
      };
      const evaluationQueries = await this.readEquivalentQueries();

      context.logger.info(`Computing the answer lineage of the queries`);
      const lineage = await new LineageComputer({
        engine: fullEngine,
        engineContext: fullContext,
        documents,
        queries,
        evaluationQueries,
        publishedResults,
        limitCandidates: ExperimentLargeRdfBench.LIMIT_CANDIDATES,
        timeoutSeconds: this.generationQueryTimeout,
        lineageDirectory: paths.lineage,
        resultsDirectory: paths.results,
        log,
      }).computeAll();

      context.logger.info(`Sampling the datasets`);
      const { datasets, patterns } = await new DatasetSampler({
        documents,
        queries: Object.values(queries),
        subjectRates: this.sampleSubjectRates,
        otherTriplesRate: this.sampleOtherTriplesRate,
        seed: this.sampleSeed,
        lineageDirectory: paths.lineage,
        outputDirectory: paths.datasets,
        log,
      }).sampleAll();

      let validation: Record<string, any> | undefined;
      if (this.sampleValidate) {
        context.logger.info(`Validating the sample`);
        validation = await new SampleValidator({
          sampleEngine: new QueryEngineRdfJs(),
          sampleContext: { sources: await this.loadSampleStores(paths) },
          fullEngine,
          fullContext,
          queries,
          evaluationQueries,
          publishedResults,
          resultsDirectory: paths.results,
          sampleTimeoutSeconds: this.generationQueryTimeout,
          fullTimeoutSeconds: this.generationQueryTimeout,
          log,
        }).validateAll();
        const failed = Object.keys(validation).filter(id => !validation![id].ok);
        if (failed.length > 0) {
          throw new Error(`The sample does not produce the same results as the full data for ${failed.join(', ')}`);
        }
      } else {
        // The published results are used as expected results, next to the ones computed for the LIMIT queries.
        await this.writePublishedResults(paths, publishedResults);
      }

      await this.writeManifest(paths, {
        seed: this.sampleSeed,
        subjectRates: this.sampleSubjectRates,
        otherTriplesRate: this.sampleOtherTriplesRate,
        datasets,
        sampleTriples: Object.values(datasets).reduce((sum, stats) => sum + stats.sampleTriples, 0),
        patterns,
        lineage: Object.fromEntries(Object.entries(lineage)
          .map(([ id, stats ]) => [ id, { ...stats, unmatchedRows: stats.unmatchedRows.length }])),
        ...validation ? { validation } : {},
      });
    } finally {
      for (const document of Object.values(documents)) {
        await document.close();
      }
    }
  }

  /**
   * Load the modules that are needed to generate a sample.
   */
  public static async loadGenerationModules(): Promise<{
    hdt: { fromFile: (path: string) => Promise<IHdtDocumentLike & { close: () => Promise<void> }> };
    QueryEngineHdt: new() => IQueryEngineLike;
    QueryEngineRdfJs: new() => IQueryEngineLike;
  }> {
    try {
      return {
        hdt: await import('hdt'),
        QueryEngineHdt: (await import('@comunica/query-sparql-hdt')).QueryEngine,
        QueryEngineRdfJs: (await import('@comunica/query-sparql-rdfjs')).QueryEngine,
      };
    } catch (error: unknown) {
      throw new Error(`Generating a LargeRDFBench sample requires the optional dependencies hdt and @comunica/query-sparql-hdt, which could not be loaded: ${(<Error> error).message}`);
    }
  }

  /**
   * Load each sampled dataset into its own store, so that, as in a federation, matches in multiple datasets are not
   * merged.
   * @param paths The paths of the generated files.
   */
  public async loadSampleStores(paths: ILargeRdfBenchPaths): Promise<RdfStore[]> {
    const stores: RdfStore[] = [];
    for (const dataset of this.datasets) {
      const store = RdfStore.createDefault();
      const parser = new StreamParser({ format: 'N-Triples' });
      fs.createReadStream(this.getDatasetPath(paths, dataset)).pipe(parser);
      await new Promise((resolve, reject) => store.import(parser).on('end', resolve).on('error', reject));
      stores.push(store);
    }
    return stores;
  }

  /**
   * Write the manifest, which describes how the generated files were obtained.
   * @param paths The paths of the generated files.
   * @param details Details on the sample.
   */
  public async writeManifest(paths: ILargeRdfBenchPaths, details: Record<string, any>): Promise<void> {
    const manifest = {
      source: `https://zenodo.org/records/${this.zenodoRecord}`,
      sample: this.sample,
      queries: this.queries,
      ...details,
    };
    await fs.writeFile(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  public async run(context: IRunTaskContext): Promise<void> {
    await fs.ensureDir(Path.join(context.experimentPaths.output, 'logs'));
    const startTime = performance.now();
    const closeProcesses: (() => Promise<void>)[] = [];
    const processHandlers: ProcessHandler[] = [];

    // Start the sources one by one, so that they do not load their datasets at the same time.
    for (const [ i, hook ] of this.hookSparqlEndpointSources.entries()) {
      const processHandler = await hook.start(context);
      processHandlers.push(processHandler);
      closeProcesses.push(secureProcessHandler(processHandler, context));
      if (this.sourceUrlsExternal[i]) {
        await this.httpAvailabilityLatch.sleepUntilAvailable(context, this.sourceUrlsExternal[i]);
      }
    }

    // Start the federation engine
    const endpointProcessHandler = await this.hookSparqlEndpoint.start(context);
    processHandlers.push(endpointProcessHandler);
    closeProcesses.push(secureProcessHandler(endpointProcessHandler, context));
    await this.httpAvailabilityLatch.sleepUntilAvailable(context, this.endpointUrlExternal);
    await fs.writeFile(Path.join(context.experimentPaths.output, 'logs', 'load-time.csv'), `time\n${Math.round(performance.now() - startTime)}`, 'utf-8');

    // Determine query sets
    const paths = ExperimentLargeRdfBench.getPaths(context.experimentPaths.generated);
    let querySets = await new QueryLoaderFile({ path: paths.queries, extensions: [ '.sparql' ]}).loadQueries();
    if (context.filter) {
      const filterRegex = new RegExp(context.filter, 'u');
      querySets = Object.fromEntries(Object.entries(querySets)
        .filter(entry => filterRegex.test(entry[0])));
    }

    // Initiate SPARQL benchmark runner
    const processHandlerComposite = new ProcessHandlerComposite(processHandlers);
    let stopStats: () => void;
    const results = await new SparqlBenchmarkRunner({
      endpoint: this.endpointUrl,
      endpointUpCheck: this.endpointUrlExternal,
      querySets,
      replication: this.queryRunnerReplication,
      warmup: this.queryRunnerWarmupRounds,
      requestDelay: this.queryRunnerRequestDelay,
      availabilityCheckTimeout: this.queryRunnerEndpointAvailabilityCheckTimeout,
      logger: (message: string) => process.stderr.write(`${message}\n`),
      additionalUrlParams: new URLSearchParams(this.queryRunnerUrlParams),
      timeout: this.queryTimeoutFallback,
      recoveryQuery: 'ASK { ?s ?p ?o }',
    }).runWithRawResults({
      async onStart() {
        // Collect stats
        stopStats = await processHandlerComposite.startCollectingStats();

        // Breakpoint right before starting queries.
        if (context.breakpointBarrier) {
          await context.breakpointBarrier();
        }
      },
      async onStop() {
        stopStats();
      },
    });

    // Write results
    const resultsOutput = context.experimentPaths.output;
    context.logger.info(`Writing results to ${resultsOutput}\n`);
    await new ResultSerializerCsv().serialize(Path.join(resultsOutput, 'query-times.csv'), results.aggregateResults);
    if (results.rawResults) {
      const resultSerializerRaw: IResultSerializer = new ResultSerializerRaw();
      await resultSerializerRaw.serialize(Path.join(resultsOutput, 'query-results-raw.json'), results.rawResults);
    }

    // Close processes safely, the federation engine first
    for (const closeProcess of closeProcesses.reverse()) {
      await closeProcess();
    }
  }

  public async clean(context: ITaskContext, cleanTargets: ICleanTargets): Promise<void> {
    await this.hookSparqlEndpoint.clean(context, cleanTargets);
    for (const hook of this.hookSparqlEndpointSources) {
      await hook.clean(context, cleanTargets);
    }
  }
}
