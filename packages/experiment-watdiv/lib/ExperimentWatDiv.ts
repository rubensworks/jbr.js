import * as Path from 'path';
import * as fs from 'fs-extra';
import type { Experiment, Hook, ITaskContext } from 'jbr';
import { readQueries, SparqlBenchmarkRunner, writeBenchmarkResults } from 'sparql-benchmark-runner';

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
  public readonly queryRunnerRecordTimestamps: boolean;

  public constructor(
    datasetScale: number,
    queryCount: number,
    queryRecurrence: number,
    generateHdt: boolean,
    hookSparqlEndpoint: Hook,
    endpointUrl: string,
    queryRunnerReplication: number,
    queryRunnerWarmupRounds: number,
    queryRunnerRecordTimestamps: boolean,
  ) {
    this.datasetScale = datasetScale;
    this.queryCount = queryCount;
    this.queryRecurrence = queryRecurrence;
    this.generateHdt = generateHdt;
    this.hookSparqlEndpoint = hookSparqlEndpoint;
    this.endpointUrl = endpointUrl;
    this.queryRunnerReplication = queryRunnerReplication;
    this.queryRunnerWarmupRounds = queryRunnerWarmupRounds;
    this.queryRunnerRecordTimestamps = queryRunnerRecordTimestamps;
  }

  public async prepare(context: ITaskContext): Promise<void> {
    // Prepare hook
    await this.hookSparqlEndpoint.prepare(context);

    // Prepare dataset
    context.logger.info(`Generating WatDiv dataset and queries`);
    await context.docker.imagePuller.pull({ repoTag: ExperimentWatDiv.DOCKER_IMAGE_WATDIV });
    await context.docker.containerCreator.start({
      imageName: ExperimentWatDiv.DOCKER_IMAGE_WATDIV,
      cmdArgs: [ '-s', String(this.datasetScale), '-q', String(this.queryCount), '-r', String(this.queryRecurrence) ],
      hostConfig: {
        Binds: [
          `${context.experimentPaths.generated}:/output`,
        ],
      },
      logFilePath: Path.join(context.experimentPaths.output, 'logs', 'watdiv-generation.txt'),
    });

    if (this.generateHdt) {
      // Create HDT file
      context.logger.info(`Converting WatDiv dataset to HDT`);

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

  public async run(context: ITaskContext): Promise<void> {
    // Setup SPARQL endpoint
    const endpointProcessHandler = await this.hookSparqlEndpoint.start(context);

    // Register cleanup handler
    async function cleanupHandler(): Promise<void> {
      await Promise.all([
        endpointProcessHandler.close(),
      ]);
    }
    context.cleanupHandlers.push(cleanupHandler);

    // Initiate SPARQL benchmark runner
    let stopEndpointStats: () => void;
    const results = await new SparqlBenchmarkRunner({
      endpoint: this.endpointUrl,
      querySets: await readQueries(Path.join(context.experimentPaths.generated, 'queries')),
      replication: this.queryRunnerReplication,
      warmup: this.queryRunnerWarmupRounds,
      timestampsRecording: this.queryRunnerRecordTimestamps,
      logger: (message: string) => process.stderr.write(message),
    }).run({
      async onStart() {
        // Collect stats
        stopEndpointStats = await endpointProcessHandler.startCollectingStats();
      },
      async onStop() {
        stopEndpointStats();
      },
    });

    // Write results
    const resultsOutput = context.experimentPaths.output;
    if (!await fs.pathExists(resultsOutput)) {
      await fs.mkdir(resultsOutput);
    }
    context.logger.info(`Writing results to ${resultsOutput}\n`);
    await writeBenchmarkResults(results, Path.join(resultsOutput, 'query-times.csv'), this.queryRunnerRecordTimestamps);

    // Close endpoint and server
    await cleanupHandler();
  }
}
