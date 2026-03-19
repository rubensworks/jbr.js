import * as fsOld from 'fs';
import { finished } from 'node:stream/promises';
import type streamWeb from 'node:stream/web';
import * as Path from 'path';
import { Readable } from 'stream';
import * as fs from 'fs-extra';
import { HdtConverter, ProcessHandlerComposite, secureProcessHandler } from 'jbr';
import type { Experiment, Hook, ICleanTargets, ITaskContext, IRunTaskContext } from 'jbr';
import { SparqlBenchmarkRunner, QueryLoaderFile, ResultSerializerCsv } from 'sparql-benchmark-runner';
import { Extract } from 'unzipper';

/**
 * An experiment instance for LargeRDFBench.
 */
export class ExperimentLargeRdfBench implements Experiment {
  public readonly datasetUrl: string;
  public readonly generateHdt: boolean;
  public readonly hookSparqlEndpointFederationEngine: Hook;
  public readonly hookSparqlEndpointsSources: Hook[];
  public readonly endpointUrl: string;
  public readonly endpointUrlExternal: string;
  public readonly queryRunnerReplication: number;
  public readonly queryRunnerWarmupRounds: number;
  public readonly queryRunnerRequestDelay: number;
  public readonly queryRunnerEndpointAvailabilityCheckTimeout: number;
  public readonly queryRunnerUrlParams: Record<string, any>;
  public readonly queryTimeoutFallback: number | undefined;

  /**
   * @param datasetUrl
   * @param generateHdt
   * @param hookSparqlEndpointFederationEngine
   * @param hookSparqlEndpointsSources
   * @param endpointUrl
   * @param endpointUrlExternal
   * @param queryRunnerReplication
   * @param queryRunnerWarmupRounds
   * @param queryRunnerRequestDelay
   * @param queryRunnerEndpointAvailabilityCheckTimeout
   * @param queryRunnerUrlParams - @range {json}
   * @param queryTimeoutFallback
   */
  public constructor(
    datasetUrl: string,
    generateHdt: boolean,
    hookSparqlEndpointFederationEngine: Hook,
    hookSparqlEndpointsSources: Hook[],
    endpointUrl: string,
    endpointUrlExternal: string,
    queryRunnerReplication: number,
    queryRunnerWarmupRounds: number,
    queryRunnerRequestDelay: number,
    queryRunnerEndpointAvailabilityCheckTimeout: number,
    queryRunnerUrlParams: Record<string, any>,
    queryTimeoutFallback: number | undefined,
  ) {
    this.datasetUrl = datasetUrl;
    this.generateHdt = generateHdt;
    this.hookSparqlEndpointFederationEngine = hookSparqlEndpointFederationEngine;
    this.hookSparqlEndpointsSources = hookSparqlEndpointsSources;
    this.endpointUrl = endpointUrl;
    this.endpointUrlExternal = endpointUrlExternal;
    this.queryRunnerReplication = queryRunnerReplication;
    this.queryRunnerWarmupRounds = queryRunnerWarmupRounds;
    this.queryRunnerRequestDelay = queryRunnerRequestDelay;
    this.queryRunnerEndpointAvailabilityCheckTimeout = queryRunnerEndpointAvailabilityCheckTimeout;
    this.queryRunnerUrlParams = queryRunnerUrlParams;
    this.queryTimeoutFallback = queryTimeoutFallback;
  }

  public async prepare(context: ITaskContext, forceOverwriteGenerated: boolean): Promise<void> {
    // Prepare hook
    await this.hookSparqlEndpointFederationEngine.prepare(context, forceOverwriteGenerated);
    await Promise.all(this.hookSparqlEndpointsSources
      .map(hookSparqlEndpoint => hookSparqlEndpoint.prepare(context, forceOverwriteGenerated)));

    // Ensure logs directory exists
    await fs.ensureDir(Path.join(context.experimentPaths.output, 'logs'));

    // Prepare dataset
    const directoryTarget = Path.join(context.experimentPaths.generated, 'large-rdf-bench');
    const downloadTarget = Path.join(context.experimentPaths.generated, 'large-rdf-bench.zip');
    context.logger.info(`Preparing LargeRDFBench dataset and queries`);
    if (await fs.pathExists(directoryTarget)) {
      context.logger.info(`  Skipped`);
    } else {
      // Fetch dataset
      context.logger.info(`Fetching LargeRDFBench archive`);
      await fs.ensureDir(Path.join(context.experimentPaths.generated, 'data'));
      const res = await fetch(this.datasetUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch ${this.datasetUrl}: ${res.status}`);
      }
      await finished(Readable
        .fromWeb(<streamWeb.ReadableStream>res.body)
        .pipe(fsOld.createWriteStream(downloadTarget, { flags: 'wx' })));

      // Unzip main archive
      context.logger.info(`Extracting LargeRDFBench archive`);
      await finished(fsOld.createReadStream(downloadTarget)
        .pipe(Extract({ path: directoryTarget })));

      // Unzip datasets
      for (const dataset of await fs.readdir(Path.join(directoryTarget, 'large-rdf-bench'))) {
        context.logger.info(`Extracting LargeRDFBench dataset ${dataset}`);
        await finished(fsOld.createReadStream(Path.join(directoryTarget, 'large-rdf-bench', dataset)).pipe(Extract({
          path: Path.join(directoryTarget, 'large-rdf-bench', dataset.replace('.zip', ''), 'dataset.nt'),
        })));
      }
    }

    if (this.generateHdt) {
      for (const dataset of await fs.readdir(Path.join(directoryTarget, 'large-rdf-bench'))) {
        await new HdtConverter(
          context,
          forceOverwriteGenerated,
          'dataset',
          Path.join(context.experimentPaths.generated, 'large-rdf-bench', dataset, 'dataset.hdt'),
        ).generate();
      }
    }
  }

  public async run(context: IRunTaskContext): Promise<void> {
    // Setup SPARQL endpoint
    const startTime = performance.now();
    const endpointProcessHandlers = await Promise.all([
      this.hookSparqlEndpointFederationEngine,
      ...this.hookSparqlEndpointsSources,
    ]
      .map(hookSparqlEndpoint => hookSparqlEndpoint.start(context)));
    const closeProcess = secureProcessHandler(new ProcessHandlerComposite(endpointProcessHandlers), context);

    // Determine query sets
    const queryLoader = new QueryLoaderFile({
      path: Path.join(context.experimentPaths.generated, 'large-rdf-bench', 'queries'),
      extensions: [ '.sparql' ],
    });
    let querySets = await queryLoader.loadQueries();
    if (context.filter) {
      const filterRegex = new RegExp(context.filter, 'u');
      querySets = Object.fromEntries(Object.entries(querySets)
        .filter(entry => filterRegex.test(entry[0])));
    }

    // Initiate SPARQL benchmark runner
    const stopEndpointStats: (() => void)[] = [];
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
    }).run({
      async onStart() {
        // Measure time it took to start the endpoint
        await fs.writeFile(Path.join(context.experimentPaths.output, 'logs', 'load-time.csv'), `time\n${Math.round(performance.now() - startTime)}`, 'utf-8');

        // Collect stats
        for (const endpointProcessHandler of endpointProcessHandlers) {
          stopEndpointStats.push(await endpointProcessHandler.startCollectingStats());
        }

        // Breakpoint right before starting queries.
        if (context.breakpointBarrier) {
          await context.breakpointBarrier();
        }
      },
      async onStop() {
        for (const entry of stopEndpointStats) {
          entry();
        }
      },
    });

    // Write results
    const resultSerializer = new ResultSerializerCsv();
    const resultsOutput = context.experimentPaths.output;
    if (!await fs.pathExists(resultsOutput)) {
      await fs.mkdir(resultsOutput);
    }
    context.logger.info(`Writing results to ${resultsOutput}\n`);
    await resultSerializer.serialize(Path.join(resultsOutput, 'query-times.csv'), results);

    // Close process safely
    await closeProcess();
  }

  public async clean(context: ITaskContext, cleanTargets: ICleanTargets): Promise<void> {
    await this.hookSparqlEndpointFederationEngine.clean(context, cleanTargets);
    await Promise.all(this.hookSparqlEndpointsSources
      .map(hookSparqlEndpoint => hookSparqlEndpoint.clean(context, cleanTargets)));
  }
}
