import * as Path from 'path';
import * as fs from 'fs-extra';
import type { ITaskContext } from 'jbr';
import { ProcessHandlerComposite, secureProcessHandler } from 'jbr';
import type {
  IResultSerializer,
} from 'sparql-benchmark-runner';
import {
  SparqlBenchmarkRunner,
  QueryLoaderFile,
  ResultSerializerCsv,
  ResultSerializerRaw,
} from 'sparql-benchmark-runner';
import type { IExperimentSolidBenchOptions } from '../../experiment-solidbench';
import { ExperimentSolidBench } from '../../experiment-solidbench';

/**
 * An experiment instance for the SolidBench social network benchmark.
 */
export class ExperimentSolidSessionBench extends ExperimentSolidBench {
  public constructor(options: IExperimentSolidBenchOptions) {
    super(options);
  }

  public async run(context: ITaskContext): Promise<void> {
    // Start server
    const [ serverHandler, networkHandler ] = await this.startServer(context);

    // Setup SPARQL endpoint
    const network = networkHandler.network.id;
    const endpointProcessHandler = await this.hookSparqlEndpoint.start(context, { docker: { network }});

    const processHandler = new ProcessHandlerComposite([
      serverHandler,
      endpointProcessHandler,
      networkHandler,
    ]);
    const closeProcess = secureProcessHandler(processHandler, context);

    // Wait for the server to be fully available
    await this.waitForEndpoint(context);

    // Set up the query loader
    const queryLoader = new QueryLoaderFile({
      path: Path.join(context.experimentPaths.generated, 'out-queries'),
      extensions: [ '.sparql', '.rq' ],
    });

    // Initiate SPARQL benchmark runner
    let stopStats: () => void;
    const results = await new SparqlBenchmarkRunner({
      endpoint: this.endpointUrl,
      querySets: await queryLoader.loadQueries(),
      querySetsMetadata: await queryLoader.loadQueriesMetadata(),
      replication: this.queryRunnerReplication,
      warmup: this.queryRunnerWarmupRounds,
      requestDelay: this.queryRunnerRequestDelay,
      availabilityCheckTimeout: this.queryRunnerEndpointAvailabilityCheckTimeout,
      logger: (message: string) => process.stderr.write(`${message}\n`),
      additionalUrlParams: new URLSearchParams(this.queryRunnerUrlParams),
      timeout: this.queryTimeoutFallback,
      invalidateCacheBetweenSetExecutions: true,
    }).runWithRawResults({
      async onStart() {
        // Collect stats
        stopStats = await processHandler.startCollectingStats();

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
    const resultSerializer = new ResultSerializerCsv();
    const resultsOutput = context.experimentPaths.output;
    if (!await fs.pathExists(resultsOutput)) {
      await fs.mkdir(resultsOutput);
    }
    context.logger.info(`Writing results to ${resultsOutput}\n`);
    await resultSerializer.serialize(Path.join(resultsOutput, 'query-times.csv'), results.aggregateResults);

    if (results.rawResults) {
      const resultSerializerRaw: IResultSerializer = new ResultSerializerRaw();
      await resultSerializerRaw.serialize(Path.join(resultsOutput, 'query-results-raw.json'), results.rawResults);
    }

    // Close endpoint and server
    await closeProcess();
  }
}
