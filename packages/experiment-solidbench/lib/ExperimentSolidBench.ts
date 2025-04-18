import * as Path from 'path';
import * as v8 from 'v8';
import * as fs from 'fs-extra';
import type { Experiment, Hook, ITaskContext,
  DockerResourceConstraints, ICleanTargets, DockerContainerHandler, DockerNetworkHandler } from 'jbr';
import { HttpAvailabilityLatch, ProcessHandlerComposite, secureProcessHandler } from 'jbr';
import { Generator } from 'solidbench/lib/Generator';
import { SparqlBenchmarkRunner, QueryLoaderFile, ResultSerializerCsv } from 'sparql-benchmark-runner';

/**
 * An experiment instance for the SolidBench social network benchmark.
 */
export class ExperimentSolidBench implements Experiment {
  public readonly httpAvailabilityLatch = new HttpAvailabilityLatch();
  public readonly scale: string;
  public readonly configEnhance: string;
  public readonly configFragment: string;
  public readonly configQueries: string;
  public readonly configServer: string;
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
  public readonly queryRunnerRequestDelay: number;
  public readonly queryRunnerEndpointAvailabilityCheckTimeout: number;
  public readonly queryRunnerUrlParams: Record<string, any>;
  public readonly queryTimeoutFallback: number | undefined;

  /**
   * @param scale
   * @param configGenerateAux
   * @param configFragment
   * @param configFragmentAux
   * @param configQueries
   * @param configServer
   * @param validationParamsUrl
   * @param configValidation
   * @param hadoopMemory
   * @param dockerfileServer
   * @param hookSparqlEndpoint
   * @param serverPort
   * @param serverLogLevel
   * @param serverBaseUrl
   * @param serverResourceConstraints
   * @param endpointUrl
   * @param queryRunnerReplication
   * @param queryRunnerWarmupRounds
   * @param queryRunnerRequestDelay
   * @param queryRunnerEndpointAvailabilityCheckTimeout
   * @param queryRunnerUrlParams - @range {json}
   * @param queryTimeoutFallback
   */
  public constructor(
    scale: string,
    configEnhance: string,
    configFragment: string,
    configQueries: string,
    configServer: string,
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
    queryRunnerRequestDelay: number,
    queryRunnerEndpointAvailabilityCheckTimeout: number,
    queryRunnerUrlParams: Record<string, any>,
    queryTimeoutFallback: number | undefined,
  ) {
    this.scale = scale;
    this.configEnhance = configEnhance;
    this.configFragment = configFragment;
    this.configQueries = configQueries;
    this.configServer = configServer;
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
    this.queryRunnerRequestDelay = queryRunnerRequestDelay;
    this.queryRunnerEndpointAvailabilityCheckTimeout = queryRunnerEndpointAvailabilityCheckTimeout;
    this.queryRunnerUrlParams = queryRunnerUrlParams;
    this.queryTimeoutFallback = queryTimeoutFallback;
  }

  public getDockerImageName(context: ITaskContext, type: string): string {
    return context.docker.imageBuilder.getImageName(context, `solidbench-${type}`);
  }

  public async replaceBaseUrlInDir(path: string): Promise<void> {
    for (const entry of await fs.readdir(path, { withFileTypes: true })) {
      if (entry.isFile()) {
        const file = Path.join(path, entry.name);
        await fs.writeFile(file, (await fs.readFile(file, 'utf8'))
          .replace(/localhost:3000/ug, 'solidbench-server:3000'));
      } else if (entry.isDirectory()) {
        await this.replaceBaseUrlInDir(Path.join(path, entry.name));
      }
    }
  }

  public async prepare(context: ITaskContext, forceOverwriteGenerated: boolean): Promise<void> {
    // Validate memory limit
    const minimumMemory = 8192;
    // eslint-disable-next-line no-bitwise
    const currentMemory = v8.getHeapStatistics().heap_size_limit / 1024 / 1024;
    if (currentMemory < minimumMemory) {
      context.logger.warn(`SolidBench recommends allocating at least ${minimumMemory} MB of memory, while only ${currentMemory} was allocated.\nThis can be configured using Node's --max_old_space_size option.`);
    }

    // Prepare hook
    await this.hookSparqlEndpoint.prepare(context, forceOverwriteGenerated);

    // Prepare dataset
    await new Generator({
      verbose: context.verbose,
      cwd: context.experimentPaths.generated,
      overwrite: forceOverwriteGenerated,
      scale: this.scale,
      enhancementConfig: Path.resolve(context.cwd, this.configEnhance),
      fragmentConfig: Path.resolve(context.cwd, this.configFragment),
      queryConfig: Path.resolve(context.cwd, this.configQueries),
      validationParams: this.validationParamsUrl,
      validationConfig: Path.resolve(context.cwd, this.configValidation),
      hadoopMemory: this.hadoopMemory,
    }).generate();

    // Replace prefix URLs to correct base URL in queries directory
    await this.replaceBaseUrlInDir(Path.resolve(context.experimentPaths.generated, 'out-queries'));

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
    await resultSerializer.serialize(Path.join(resultsOutput, 'query-times.csv'), results);

    // Close endpoint and server
    await closeProcess();
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
      containerName: 'solidbench-server',
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
      await context.docker.containerCreator.remove('solidbench-server');
    }
  }

  public async waitForEndpoint(context: ITaskContext): Promise<void> {
    await this.httpAvailabilityLatch.sleepUntilAvailable(context, `${this.serverBaseUrl}dbpedia.org/`);
  }
}
