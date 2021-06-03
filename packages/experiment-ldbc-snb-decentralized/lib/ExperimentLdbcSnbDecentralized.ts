import * as Path from 'path';
import * as fs from 'fs-extra';
import { Experiment } from 'jbr';
import type { Hook, ITaskContext, DockerResourceConstraints, DockerContainerHandler } from 'jbr';
import { Generator } from 'ldbc-snb-decentralized/lib/Generator';
import { readQueries, SparqlBenchmarkRunner, writeBenchmarkResults } from 'sparql-benchmark-runner';

/**
 * An experiment instance for the LDBC SNB Decentralized benchmark.
 */
export class ExperimentLdbcSnbDecentralized extends Experiment {
  public readonly scale: string;
  public readonly configGenerateAux: string;
  public readonly configFragment: string;
  public readonly configFragmentAux: string;
  public readonly configQueries: string;
  public readonly configServer: string;
  public readonly directoryQueryTemplates: string;
  public readonly overwriteFilesDuringPrepare: boolean;
  public readonly hadoopMemory: string;
  public readonly dockerfileServer: string;
  public readonly hookSparqlEndpoint: Hook;
  public readonly serverPort: number;
  public readonly serverLogLevel: string;
  public readonly serverResourceConstraints: DockerResourceConstraints;
  public readonly endpointUrl: string;
  public readonly queryRunnerReplication: number;
  public readonly queryRunnerWarmupRounds: number;
  public readonly queryRunnerRecordTimestamps: boolean;

  public constructor(
    scale: string,
    configGenerateAux: string,
    configFragment: string,
    configFragmentAux: string,
    configQueries: string,
    configServer: string,
    directoryQueryTemplates: string,
    overwriteFilesDuringPrepare: boolean,
    hadoopMemory: string,
    dockerfileServer: string,
    hookSparqlEndpoint: Hook,
    serverPort: number,
    serverLogLevel: string,
    serverResourceConstraints: DockerResourceConstraints,
    endpointUrl: string,
    queryRunnerReplication: number,
    queryRunnerWarmupRounds: number,
    queryRunnerRecordTimestamps: boolean,
  ) {
    super();
    this.scale = scale;
    this.configGenerateAux = configGenerateAux;
    this.configFragment = configFragment;
    this.configFragmentAux = configFragmentAux;
    this.configQueries = configQueries;
    this.configServer = configServer;
    this.directoryQueryTemplates = directoryQueryTemplates;
    this.overwriteFilesDuringPrepare = overwriteFilesDuringPrepare;
    this.hadoopMemory = hadoopMemory;
    this.dockerfileServer = dockerfileServer;
    this.hookSparqlEndpoint = hookSparqlEndpoint;
    this.endpointUrl = endpointUrl;
    this.serverPort = serverPort;
    this.serverLogLevel = serverLogLevel;
    this.serverResourceConstraints = serverResourceConstraints;
    this.queryRunnerReplication = queryRunnerReplication;
    this.queryRunnerWarmupRounds = queryRunnerWarmupRounds;
    this.queryRunnerRecordTimestamps = queryRunnerRecordTimestamps;
  }

  public getServerDockerImageName(context: ITaskContext): string {
    return `jrb-experiment-${Path.basename(context.cwd)}-server`;
  }

  public async prepare(context: ITaskContext): Promise<void> {
    // Prepare hook
    await this.hookSparqlEndpoint.prepare(context);

    // Prepare dataset
    await new Generator({
      verbose: context.verbose,
      cwd: Path.join(context.cwd, 'generated'),
      overwrite: this.overwriteFilesDuringPrepare,
      scale: this.scale,
      enhancementConfig: this.configGenerateAux,
      fragmentConfig: this.configFragment,
      enhancementFragmentConfig: this.configFragmentAux,
      queryConfig: this.configQueries,
      hadoopMemory: this.hadoopMemory,
    }).generate();

    // Build server Dockerfile
    await context.docker.imageBuilder.build({
      cwd: context.cwd,
      dockerFile: this.dockerfileServer,
      auxiliaryFiles: [ this.configServer ],
      imageName: this.getServerDockerImageName(context),
      buildArgs: {
        CONFIG_SERVER: this.configServer,
        LOG_LEVEL: this.serverLogLevel,
      },
    });
  }

  public async run(context: ITaskContext): Promise<void> {
    // Start server
    const serverHandler = await this.startServer(context);

    // Setup SPARQL endpoint
    const endpointProcessHandler = await this.hookSparqlEndpoint.start(context);

    // Stop processes on force-exit
    async function closeServices(forceExit: boolean): Promise<void> {
      try {
        await serverHandler.close();
      } catch {
        // Ignore errors
      }
      try {
        await endpointProcessHandler.close();
      } catch {
        // Ignore errors
      }
      if (forceExit) {
        context.exitProcess();
      }
    }
    process.on('SIGINT', () => closeServices(true));

    // Initiate SPARQL benchmark runner
    let stopServerStats: () => void;
    let stopEndpointStats: () => void;
    const results = await new SparqlBenchmarkRunner({
      endpoint: this.endpointUrl,
      querySets: await readQueries(Path.join(context.cwd, 'generated', 'out-queries')),
      replication: this.queryRunnerReplication,
      warmup: this.queryRunnerWarmupRounds,
      timestampsRecording: this.queryRunnerRecordTimestamps,
      logger: (message: string) => process.stderr.write(message),
    }).run({
      async onStart() {
        // Collect stats
        stopServerStats = await serverHandler.startCollectingStats();
        stopEndpointStats = await endpointProcessHandler.startCollectingStats();
      },
      async onStop() {
        stopServerStats();
        stopEndpointStats();
      },
    });

    // Write results
    const resultsOutput = Path.join(context.cwd, 'output');
    if (!await fs.pathExists(resultsOutput)) {
      await fs.mkdir(resultsOutput);
    }
    context.logger.info(`Writing results to ${resultsOutput}\n`);
    await writeBenchmarkResults(results, Path.join(resultsOutput, 'query-times.csv'), this.queryRunnerRecordTimestamps);

    // Close endpoint and server
    await closeServices(false);
  }

  public async startServer(context: ITaskContext): Promise<DockerContainerHandler> {
    return await context.docker.containerCreator.start({
      imageName: this.getServerDockerImageName(context),
      resourceConstraints: this.serverResourceConstraints,
      hostConfig: {
        Binds: [
          `${context.cwd}/generated/out-fragments/:/data`,
        ],
        PortBindings: {
          '3000/tcp': [
            { HostPort: `${this.serverPort}` },
          ],
        },
      },
      logFilePath: Path.join(context.cwd, 'output', 'logs', 'server.txt'),
      statsFilePath: Path.join(context.cwd, 'output', 'stats-server.csv'),
    });
  }
}
