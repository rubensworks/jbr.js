import * as Path from 'path';
import * as v8 from 'v8';
import * as fs from 'fs-extra';
import type { Experiment, Hook, ITaskContext,
  DockerResourceConstraints, ICleanTargets, DockerContainerHandler, DockerNetworkHandler } from 'jbr';
import { ProcessHandlerComposite } from 'jbr';
import { Generator } from 'ldbc-snb-decentralized/lib/Generator';
import { readQueries, SparqlBenchmarkRunner, writeBenchmarkResults } from 'sparql-benchmark-runner';

/**
 * An experiment instance for the LDBC SNB Decentralized benchmark.
 */
export class ExperimentLdbcSnbDecentralized implements Experiment {
  public readonly scale: string;
  public readonly configGenerateAux: string;
  public readonly configFragment: string;
  public readonly configFragmentAux: string;
  public readonly configQueries: string;
  public readonly configServer: string;
  public readonly directoryQueryTemplates: string;
  public readonly validationParamsUrl: string;
  public readonly configValidation: string;
  public readonly hadoopMemory: string;
  public readonly dockerfileServer: string;
  public readonly hookSparqlEndpoint: Hook;
  public readonly serverPort: number;
  public readonly serverLogLevel: string;
  public readonly serverBaseUrl: string;
  public readonly serverResourceConstraints: DockerResourceConstraints;
  public readonly endpointUrl: string;
  public readonly queryRunnerReplication: number;
  public readonly queryRunnerWarmupRounds: number;
  public readonly queryRunnerRecordTimestamps: boolean;
  public readonly queryRunnerUpQuery: string;

  public constructor(
    scale: string,
    configGenerateAux: string,
    configFragment: string,
    configFragmentAux: string,
    configQueries: string,
    configServer: string,
    directoryQueryTemplates: string,
    validationParamsUrl: string,
    configValidation: string,
    hadoopMemory: string,
    dockerfileServer: string,
    hookSparqlEndpoint: Hook,
    serverPort: number,
    serverLogLevel: string,
    serverBaseUrl: string,
    serverResourceConstraints: DockerResourceConstraints,
    endpointUrl: string,
    queryRunnerReplication: number,
    queryRunnerWarmupRounds: number,
    queryRunnerRecordTimestamps: boolean,
    queryRunnerUpQuery: string,
  ) {
    this.scale = scale;
    this.configGenerateAux = configGenerateAux;
    this.configFragment = configFragment;
    this.configFragmentAux = configFragmentAux;
    this.configQueries = configQueries;
    this.configServer = configServer;
    this.directoryQueryTemplates = directoryQueryTemplates;
    this.validationParamsUrl = validationParamsUrl;
    this.configValidation = configValidation;
    this.hadoopMemory = hadoopMemory;
    this.dockerfileServer = dockerfileServer;
    this.hookSparqlEndpoint = hookSparqlEndpoint;
    this.endpointUrl = endpointUrl;
    this.serverPort = serverPort;
    this.serverLogLevel = serverLogLevel;
    this.serverBaseUrl = serverBaseUrl;
    this.serverResourceConstraints = serverResourceConstraints;
    this.queryRunnerReplication = queryRunnerReplication;
    this.queryRunnerWarmupRounds = queryRunnerWarmupRounds;
    this.queryRunnerRecordTimestamps = queryRunnerRecordTimestamps;
    this.queryRunnerUpQuery = queryRunnerUpQuery;
  }

  public getDockerImageName(context: ITaskContext, type: string): string {
    return context.docker.imageBuilder.getImageName(context, `ldbc-snb-d-${type}`);
  }

  public async prepare(context: ITaskContext, forceOverwriteGenerated: boolean): Promise<void> {
    // Validate memory limit
    const minimumMemory = 8192;
    // eslint-disable-next-line no-bitwise
    const currentMemory = v8.getHeapStatistics().heap_size_limit / 1024 / 1024;
    if (currentMemory < minimumMemory) {
      context.logger.warn(`LDBC SNB Decentralized recommends allocating at least ${minimumMemory} MB of memory, while only ${currentMemory} was allocated.\nThis can be configured using Node's --max_old_space_size option.`);
    }

    // Prepare hook
    await this.hookSparqlEndpoint.prepare(context, forceOverwriteGenerated);

    // Prepare dataset
    await new Generator({
      verbose: context.verbose,
      cwd: context.experimentPaths.generated,
      overwrite: forceOverwriteGenerated,
      scale: this.scale,
      enhancementConfig: Path.resolve(context.cwd, this.configGenerateAux),
      fragmentConfig: Path.resolve(context.cwd, this.configFragment),
      enhancementFragmentConfig: Path.resolve(context.cwd, this.configFragmentAux),
      queryConfig: Path.resolve(context.cwd, this.configQueries),
      validationParams: this.validationParamsUrl,
      validationConfig: Path.resolve(context.cwd, this.configValidation),
      hadoopMemory: this.hadoopMemory,
    }).generate();

    // Build server Dockerfile
    await context.docker.imageBuilder.build({
      cwd: context.experimentPaths.root,
      dockerFile: this.dockerfileServer,
      auxiliaryFiles: [ this.configServer ],
      imageName: this.getDockerImageName(context, 'server'),
      buildArgs: {
        CONFIG_SERVER: this.configServer,
        LOG_LEVEL: this.serverLogLevel,
        BASE_URL: this.serverBaseUrl,
      },
      logger: context.logger,
    });
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

    // Register cleanup handler
    async function cleanupHandler(): Promise<void> {
      await processHandler.close();
    }
    context.cleanupHandlers.push(cleanupHandler);

    // Initiate SPARQL benchmark runner
    let stopStats: () => void;
    const results = await new SparqlBenchmarkRunner({
      endpoint: this.endpointUrl,
      querySets: await readQueries(Path.join(context.experimentPaths.generated, 'out-queries')),
      replication: this.queryRunnerReplication,
      warmup: this.queryRunnerWarmupRounds,
      timestampsRecording: this.queryRunnerRecordTimestamps,
      logger: (message: string) => process.stderr.write(message),
      upQuery: this.queryRunnerUpQuery,
    }).run({
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
    const resultsOutput = context.experimentPaths.output;
    if (!await fs.pathExists(resultsOutput)) {
      await fs.mkdir(resultsOutput);
    }
    context.logger.info(`Writing results to ${resultsOutput}\n`);
    await writeBenchmarkResults(results, Path.join(resultsOutput, 'query-times.csv'), this.queryRunnerRecordTimestamps);

    // Close endpoint and server
    await cleanupHandler();
  }

  public async startServer(context: ITaskContext): Promise<[ DockerContainerHandler, DockerNetworkHandler ] > {
    // Create shared network
    const networkHandler = await context.docker.networkCreator
      .create({ Name: this.getDockerImageName(context, 'network') });
    const network = networkHandler.network.id;

    // Ensure logs directory exists
    await fs.ensureDir(Path.join(context.experimentPaths.output, 'logs'));

    const filePath = this.serverBaseUrl.replace('://', '/').replace(':', '_');
    const serverHandler = await context.docker.containerCreator.start({
      containerName: 'ldbc-snb-decentralized-server',
      imageName: this.getDockerImageName(context, 'server'),
      resourceConstraints: this.serverResourceConstraints,
      hostConfig: {
        Binds: [
          `${Path.join(context.experimentPaths.generated, `out-fragments/${filePath}`)}/:/data`,
        ],
        PortBindings: {
          '3000/tcp': [
            { HostPort: `${this.serverPort}` },
          ],
        },
        NetworkMode: network,
      },
      logFilePath: Path.join(context.experimentPaths.output, 'logs', 'server.txt'),
      statsFilePath: Path.join(context.experimentPaths.output, 'stats-server.csv'),
    });

    return [ serverHandler, networkHandler ];
  }

  public async clean(context: ITaskContext, cleanTargets: ICleanTargets): Promise<void> {
    await this.hookSparqlEndpoint.clean(context, cleanTargets);

    if (cleanTargets.docker) {
      await context.docker.networkCreator.remove(this.getDockerImageName(context, 'network'));
      await context.docker.containerCreator.remove('ldbc-snb-decentralized-server');
    }
  }
}
