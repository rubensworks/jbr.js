import * as Path from 'path';
import * as fs from 'fs-extra';
import { secureProcessHandler } from 'jbr';
import type { Experiment, Hook, ICleanTargets, ITaskContext, IRunTaskContext } from 'jbr';
import { SparqlBenchmarkRunner, QueryLoaderFile, ResultSerializerCsv } from 'sparql-benchmark-runner';

/**
 * An experiment instance for WatDiv.
 */
export class ExperimentSparqlCustom implements Experiment {
  public readonly queriesPath: string;
  public readonly hookSparqlEndpoint: Hook;
  public readonly endpointUrl: string;
  public readonly queryRunnerReplication: number;
  public readonly queryRunnerWarmupRounds: number;
  public readonly queryRunnerRequestDelay: number;
  public readonly queryRunnerEndpointAvailabilityCheckTimeout: number;
  public readonly queryRunnerUrlParams: Record<string, any>;
  public readonly queryTimeoutFallback: number | undefined;

  /**
   * @param queriesPath
   * @param hookSparqlEndpoint
   * @param endpointUrl
   * @param queryRunnerReplication
   * @param queryRunnerWarmupRounds
   * @param queryRunnerRequestDelay
   * @param queryRunnerEndpointAvailabilityCheckTimeout
   * @param queryRunnerUrlParams - @range {json}
   * @param queryTimeoutFallback
   */
  public constructor(
    queriesPath: string,
    hookSparqlEndpoint: Hook,
    endpointUrl: string,
    queryRunnerReplication: number,
    queryRunnerWarmupRounds: number,
    queryRunnerRequestDelay: number,
    queryRunnerEndpointAvailabilityCheckTimeout: number,
    queryRunnerUrlParams: Record<string, any>,
    queryTimeoutFallback: number | undefined,
  ) {
    this.queriesPath = queriesPath;
    this.hookSparqlEndpoint = hookSparqlEndpoint;
    this.endpointUrl = endpointUrl;
    this.queryRunnerReplication = queryRunnerReplication;
    this.queryRunnerWarmupRounds = queryRunnerWarmupRounds;
    this.queryRunnerRequestDelay = queryRunnerRequestDelay;
    this.queryRunnerEndpointAvailabilityCheckTimeout = queryRunnerEndpointAvailabilityCheckTimeout;
    this.queryRunnerUrlParams = queryRunnerUrlParams;
    this.queryTimeoutFallback = queryTimeoutFallback;
  }

  public async prepare(context: ITaskContext, forceOverwriteGenerated: boolean): Promise<void> {
    // Prepare hook
    await this.hookSparqlEndpoint.prepare(context, forceOverwriteGenerated);

    // Ensure logs directory exists
    await fs.ensureDir(Path.join(context.experimentPaths.output, 'logs'));
  }

  public async run(context: IRunTaskContext): Promise<void> {
    // Setup SPARQL endpoint
    const endpointProcessHandler = await this.hookSparqlEndpoint.start(context);
    const closeProcess = secureProcessHandler(endpointProcessHandler, context);

    // Determine query sets
    const queryLoader = new QueryLoaderFile({
      path: Path.join(context.experimentPaths.root, this.queriesPath),
      extensions: [ '.txt', '.sparql' ],
    });
    let querySets = await queryLoader.loadQueries();
    if (context.filter) {
      const filterRegex = new RegExp(context.filter, 'u');
      querySets = Object.fromEntries(Object.entries(querySets)
        .filter(entry => filterRegex.test(entry[0])));
    }

    // Initiate SPARQL benchmark runner
    let stopEndpointStats: () => void;
    const runner = new SparqlBenchmarkRunner({
      endpoint: this.endpointUrl,
      querySets,
      replication: this.queryRunnerReplication,
      warmup: this.queryRunnerWarmupRounds,
      requestDelay: this.queryRunnerRequestDelay,
      availabilityCheckTimeout: this.queryRunnerEndpointAvailabilityCheckTimeout,
      logger: (message: string) => process.stderr.write(`${message}\n`),
      additionalUrlParams: new URLSearchParams(this.queryRunnerUrlParams),
      timeout: this.queryTimeoutFallback,
    });
    // eslint-disable-next-line @typescript-eslint/no-this-alias,consistent-this
    const self = this;
    const results = await runner.run({
      async onStart() {
        // Collect stats
        stopEndpointStats = await endpointProcessHandler.startCollectingStats();

        // Breakpoint right before starting queries.
        if (context.breakpointBarrier) {
          await context.breakpointBarrier();
        }
      },
      async onStop() {
        stopEndpointStats();
      },
      async onQuery(query: string) {
        // If the query defines any sources, pass it along inside the `context` URL parameter.
        const sources = self.getQuerySources(query);
        const params: Record<string, any> = { ...self.queryRunnerUrlParams };
        if (sources) {
          let ctx: Record<string, any>;
          if (params.context) {
            ctx = JSON.parse(params.context);
          } else {
            ctx = {};
          }
          ctx.sources = sources;
          params.context = JSON.stringify(ctx);
        }
        runner.endpointFetcher.additionalUrlParams = new URLSearchParams(params);
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
    await this.hookSparqlEndpoint.clean(context, cleanTargets);
  }

  public getQuerySources(query: string): string[] | undefined {
    let sources: string[] | undefined;

    query.split('\n').forEach((line, index) => {
      // The line might be a key/value pair
      const keyValue = /^#\s*(\w+)\s*:\s*(.*)\s*/u.exec(line);
      if (keyValue) {
        const key = keyValue[1].toLowerCase();
        const value = keyValue[2];
        switch (key) {
          case 'datasource':
          case 'datasources':
            value.split(/\s+/u).forEach(source => {
              if (source.length > 0) {
                if (!sources) {
                  sources = [];
                }
                sources.push(source);
              }
            });
        }
      }
    });

    return sources;
  }
}
