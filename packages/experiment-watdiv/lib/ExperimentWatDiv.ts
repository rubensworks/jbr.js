import * as Path from 'path';
import * as fs from 'fs-extra';
import { secureProcessHandler } from 'jbr';
import type { Experiment, Hook, ICleanTargets, ITaskContext, IRunTaskContext } from 'jbr';
import { SparqlBenchmarkRunner, QueryLoaderFile, ResultSerializerCsv } from 'sparql-benchmark-runner';

/**
 * An experiment instance for the LDBC SNB Decentralized benchmark.
 */
export class ExperimentWatDiv implements Experiment {
  public static readonly DOCKER_IMAGE_WATDIV = `comunica/watdiv@sha256:2fac67737d6dddd75ea023b90bba2a1c7432a00e233791a802e374e3d2a8ec3b`;
  public static readonly DOCKER_IMAGE_HDT = `rdfhdt/hdt-cpp:v1.3.3`;
  public readonly datasetScale: number;
  public readonly queryCount: number;
  public readonly queryRecurrence: number;
  public readonly generateHdt: boolean;
  public readonly hookSparqlEndpoint: Hook;
  public readonly endpointUrl: string;
  public readonly queryRunnerReplication: number;
  public readonly queryRunnerWarmupRounds: number;
  public readonly queryRunnerRequestDelay: number;
  public readonly queryRunnerEndpointAvailabilityCheckTimeout: number;
  public readonly queryRunnerUrlParams: Record<string, any>;
  public readonly queryTimeoutFallback: number | undefined;

  /**
   * @param datasetScale
   * @param queryCount
   * @param queryRecurrence
   * @param generateHdt
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
    datasetScale: number,
    queryCount: number,
    queryRecurrence: number,
    generateHdt: boolean,
    hookSparqlEndpoint: Hook,
    endpointUrl: string,
    queryRunnerReplication: number,
    queryRunnerWarmupRounds: number,
    queryRunnerRequestDelay: number,
    queryRunnerEndpointAvailabilityCheckTimeout: number,
    queryRunnerUrlParams: Record<string, any>,
    queryTimeoutFallback: number | undefined,
  ) {
    this.datasetScale = datasetScale;
    this.queryCount = queryCount;
    this.queryRecurrence = queryRecurrence;
    this.generateHdt = generateHdt;
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

    // Prepare dataset
    context.logger.info(`Generating WatDiv dataset and queries`);
    if (!forceOverwriteGenerated && await fs.pathExists(Path.join(context.experimentPaths.generated, 'dataset.nt'))) {
      context.logger.info(`  Skipped`);
    } else {
      await context.docker.imagePuller.pull({ repoTag: ExperimentWatDiv.DOCKER_IMAGE_WATDIV });
      await (await context.docker.containerCreator.start({
        imageName: ExperimentWatDiv.DOCKER_IMAGE_WATDIV,
        cmdArgs: [ '-s', String(this.datasetScale), '-q', String(this.queryCount), '-r', String(this.queryRecurrence) ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'watdiv-generation.txt'),
      })).join();
    }

    if (this.generateHdt) {
      // Create HDT file
      context.logger.info(`Converting WatDiv dataset to HDT`);

      if (!forceOverwriteGenerated &&
        await fs.pathExists(Path.join(context.experimentPaths.generated, 'dataset.hdt'))) {
        context.logger.info(`  Skipped`);
      } else {
        // Pull HDT Docker image
        await context.docker.imagePuller.pull({ repoTag: ExperimentWatDiv.DOCKER_IMAGE_HDT });

        // Remove any existing index files
        await fs.rm(Path.join(context.experimentPaths.generated, 'dataset.hdt.index.v1-1'), { force: true });

        // Convert dataset to HDT
        await (await context.docker.containerCreator.start({
          imageName: ExperimentWatDiv.DOCKER_IMAGE_HDT,
          cmdArgs: [ 'rdf2hdt', '/output/dataset.nt', '/output/dataset.hdt' ],
          hostConfig: {
            Binds: [
              `${context.experimentPaths.generated}:/output`,
            ],
          },
          logFilePath: Path.join(context.experimentPaths.output, 'logs', 'watdiv-hdt.txt'),
        })).join();

        // Generate HDT index file
        await (await context.docker.containerCreator.start({
          imageName: ExperimentWatDiv.DOCKER_IMAGE_HDT,
          cmdArgs: [ 'hdtSearch', '/output/dataset.hdt', '-q', '0' ],
          hostConfig: {
            Binds: [
              `${context.experimentPaths.generated}:/output`,
            ],
          },
          logFilePath: Path.join(context.experimentPaths.output, 'logs', 'watdiv-hdt-index.txt'),
        })).join();
      }
    }
  }

  public async run(context: IRunTaskContext): Promise<void> {
    // Setup SPARQL endpoint
    const endpointProcessHandler = await this.hookSparqlEndpoint.start(context);
    const closeProcess = secureProcessHandler(endpointProcessHandler, context);

    // Determine query sets
    const queryLoader = new QueryLoaderFile({
      path: Path.join(context.experimentPaths.generated, 'queries'),
      extensions: [ '.txt' ],
    });
    let querySets = await queryLoader.loadQueries();
    if (context.filter) {
      const filterRegex = new RegExp(context.filter, 'u');
      querySets = Object.fromEntries(Object.entries(querySets)
        .filter(entry => filterRegex.test(entry[0])));
    }

    // Initiate SPARQL benchmark runner
    let stopEndpointStats: () => void;
    const results = await new SparqlBenchmarkRunner({
      endpoint: this.endpointUrl,
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
}
