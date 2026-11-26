import * as Path from 'node:path';
import * as fs from 'fs-extra';
import { secureProcessHandler, HttpAvailabilityLatch, HdtConverter } from 'jbr';
import type { Experiment, Hook, ICleanTargets, ITaskContext, IRunTaskContext, DockerContainerHandler } from 'jbr';

/**
 * An experiment instance for BSBM.
 */
export class ExperimentBsbm implements Experiment {
  public static readonly DOCKER_IMAGE_BSBM = `vcity/bsbm:v1.0`;
  public static readonly USE_CASES = [ 'explore', 'exploreAndUpdate' ];
  /**
   * The number of inserts in each query mix run of the exploreAndUpdate use case,
   * each of which consumes one transaction of the update dataset.
   */
  public static readonly INSERTS_PER_QUERY_MIX = 2;
  public static readonly UPDATE_TRANSACTION_SEPARATOR = '#__SEP__';
  public readonly httpAvailabilityLatch = new HttpAvailabilityLatch();
  public readonly productCount: number;
  public readonly generateHdt: boolean;
  public readonly hookSparqlEndpoint: Hook;
  public readonly endpointUrlRaw: string;
  public readonly endpointUrlExternal: string;
  public readonly warmupRuns: number;
  public readonly runs: number;
  public readonly queryTimeout: number | undefined;
  public readonly useCase: string;
  public readonly endpointUpdateUrlRaw: string;
  public readonly updateTransactions: number;

  /**
   * @param productCount
   * @param generateHdt
   * @param hookSparqlEndpoint
   * @param endpointUrl
   * @param endpointUrlExternal
   * @param warmupRuns
   * @param runs
   * @param queryTimeout Timeout of a single query in milliseconds, after which the test driver counts it as a timeout.
   * @param useCase - The BSBM use case to run: 'explore' or 'exploreAndUpdate'. Defaults to 'explore'.
   * @param endpointUpdateUrl - URL of the SPARQL endpoint for update queries. Defaults to endpointUrl.
   * @param updateTransactions - Number of products that are moved from the dataset into the update dataset,
   * one per insert. Defaults to the number of inserts of all runs.
   */
  public constructor(
    productCount: number,
    generateHdt: boolean,
    hookSparqlEndpoint: Hook,
    endpointUrl: string,
    endpointUrlExternal: string,
    warmupRuns: number,
    runs: number,
    queryTimeout: number | undefined,
    useCase?: string,
    endpointUpdateUrl?: string,
    updateTransactions?: number,
  ) {
    this.productCount = productCount;
    this.generateHdt = generateHdt;
    this.hookSparqlEndpoint = hookSparqlEndpoint;
    this.endpointUrlRaw = endpointUrl;
    this.endpointUrlExternal = endpointUrlExternal;
    this.warmupRuns = warmupRuns;
    this.runs = runs;
    this.queryTimeout = queryTimeout;
    this.useCase = useCase ?? 'explore';
    if (!ExperimentBsbm.USE_CASES.includes(this.useCase)) {
      throw new Error(`Invalid BSBM use case '${this.useCase}', must be one of ${ExperimentBsbm.USE_CASES.join(', ')}`);
    }
    this.endpointUpdateUrlRaw = endpointUpdateUrl ?? endpointUrl;
    this.updateTransactions = updateTransactions ?? this.requiredUpdateTransactions;
    if (this.updates) {
      // The generator silently moves all products into the update dataset if too many transactions are requested,
      // and the test driver silently inserts nothing once the update dataset is exhausted.
      if (!Number.isInteger(this.updateTransactions) || this.updateTransactions >= this.productCount) {
        throw new Error(`Invalid BSBM updateTransactions ${this.updateTransactions}, must be an integer below the productCount ${this.productCount}`);
      }
      if (this.updateTransactions < this.requiredUpdateTransactions) {
        throw new Error(`Invalid BSBM updateTransactions ${this.updateTransactions}, must be at least ${this.requiredUpdateTransactions} for ${this.runs} runs`);
      }
    }
  }

  /**
   * If the use case contains update queries.
   */
  public get updates(): boolean {
    return this.useCase === 'exploreAndUpdate';
  }

  /**
   * The number of update transactions that the inserts of all runs consume, as inserts are skipped in warmup runs.
   */
  public get requiredUpdateTransactions(): number {
    return this.runs * ExperimentBsbm.INSERTS_PER_QUERY_MIX;
  }

  public async getEndpointUrl(context: ITaskContext): Promise<string> {
    return this.toDockerReachableUrl(context, this.endpointUrlRaw);
  }

  public async getEndpointUpdateUrl(context: ITaskContext): Promise<string> {
    return this.toDockerReachableUrl(context, this.endpointUpdateUrlRaw);
  }

  /**
   * Make a URL on the host reachable from within a Docker container.
   * @param context The task context.
   * @param url A URL that may refer to the host as host.docker.internal.
   */
  protected async toDockerReachableUrl(context: ITaskContext, url: string): Promise<string> {
    if (process.platform === 'darwin' || process.platform === 'win32') {
      return url;
    }
    let gatewayIp = '172.17.0.1';
    try {
      const networkInfo = <IDockerNetworkInfo> await context.docker.networkInspector.inspect('bridge');
      gatewayIp = networkInfo.IPAM.Config[0].Gateway;
    } catch (error: unknown) {
      context.logger.info(`Error occurred while obtaining gateway IP from Docker bridge: ${(<any> error).message}`);
    }
    return url.replace('host.docker.internal', gatewayIp);
  }

  public async prepare(context: ITaskContext, forceOverwriteGenerated: boolean): Promise<void> {
    // Prepare hook
    await this.hookSparqlEndpoint.prepare(context, forceOverwriteGenerated);

    // Ensure logs directory exists
    await fs.ensureDir(Path.join(context.experimentPaths.output, 'logs'));

    // Prepare dataset
    context.logger.info(`Generating BSBM dataset`);
    if (!forceOverwriteGenerated && await fs.pathExists(Path.join(context.experimentPaths.generated, 'dataset.nt')) &&
      (!this.updates || await fs.pathExists(Path.join(context.experimentPaths.generated, 'dataset_update.nt')))) {
      context.logger.info(`  Skipped`);
    } else {
      await context.docker.imagePuller.pull({ repoTag: ExperimentBsbm.DOCKER_IMAGE_BSBM });
      await (await context.docker.containerCreator.start({
        imageName: ExperimentBsbm.DOCKER_IMAGE_BSBM,
        cmdArgs: [
          'generate',
          '-dir',
          '/data/td_data',
          '-pc',
          String(this.productCount),
          '-fc',
          ...this.updates ? [ '-ud', '-tc', String(this.updateTransactions) ] : [],
        ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/data`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'bsbm-generation.txt'),
      // eslint-disable-next-line unicorn/require-array-join-separator -- not an array join
      })).join();
    }

    if (this.generateHdt) {
      await new HdtConverter(context, forceOverwriteGenerated, 'bsbm').generate();
    }
  }

  public async run(context: IRunTaskContext): Promise<void> {
    if (this.updates) {
      await this.validateUpdateDataset(context);
    }

    // Create shared network
    const networkHandler = await context.docker.networkCreator.create({
      Name: context.docker.imageBuilder.getImageName(context, `experiment-bsbm-network`),
    });
    const network = networkHandler.network.id;

    // Setup SPARQL endpoint
    const startTime = performance.now();
    const endpointProcessHandler = await this.hookSparqlEndpoint.start(context);
    const endpointProcessHandlerSafe = secureProcessHandler(endpointProcessHandler, context);

    // Wait for the cache proxy to be fully available
    await this.waitForEndpoint(context);

    // Breakpoint right before starting queries.
    if (context.breakpointBarrier) {
      await context.breakpointBarrier();
    }

    // Measure time it took to start the endpoint
    await fs.writeFile(Path.join(context.experimentPaths.output, 'logs', 'load-time.csv'), `time\n${Math.round(performance.now() - startTime)}`, 'utf-8');

    // Run experiment
    context.logger.info(`Running experiment`);
    const stopEndpointStats: () => void = await endpointProcessHandler.startCollectingStats();
    const testDriverHandler = await this.startTestDriver(context, [
      '-idir',
      '/data/td_data',
      '-seed',
      '9834533',
      '-o',
      'single.xml',
      '-w',
      String(this.warmupRuns),
      '-runs',
      String(this.runs),
      ...this.queryTimeout === undefined ? [] : [ '-t', String(this.queryTimeout) ],
      ...this.updates ?
          [
            '-ucf',
            'usecases/exploreAndUpdate/sparql.txt',
            '-u',
            await this.getEndpointUpdateUrl(context),
            '-udataset',
            '/data/dataset_update.nt',
          ] :
          [],
      await this.getEndpointUrl(context),
    ], network);

    // Wait for the experiment driver to end
    // eslint-disable-next-line unicorn/require-array-join-separator -- not an array join
    await testDriverHandler.join();
    stopEndpointStats();

    // Output the run log if the run failed
    if (!await fs.pathExists(Path.join(context.experimentPaths.generated, 'single.xml'))) {
      context.logger.info(`No valid BSBM output file was generated.`);
      const logs = await fs.readFile(
        Path.join(context.experimentPaths.output, 'logs', 'bsbm-run.txt'),
        { encoding: 'utf8' },
      );
      context.logger.error(logs);
    }

    // Move output file to output directory
    await fs.move(
      Path.join(context.experimentPaths.generated, 'single.xml'),
      Path.join(context.experimentPaths.output, 'bsbm.xml'),
      {
        overwrite: true,
      },
    );

    // Close process safely
    await endpointProcessHandlerSafe();
    await networkHandler.close();
  }

  /**
   * Ensure that the update dataset has a transaction for every insert of all runs,
   * as it may have been generated for fewer runs.
   * @param context The task context.
   */
  public async validateUpdateDataset(context: ITaskContext): Promise<void> {
    const contents = await fs.readFile(
      Path.join(context.experimentPaths.generated, 'dataset_update.nt'),
      { encoding: 'utf8' },
    );
    const transactions = contents.split('\n')
      .filter(line => line === ExperimentBsbm.UPDATE_TRANSACTION_SEPARATOR).length;
    if (transactions < this.requiredUpdateTransactions) {
      throw new Error(`The BSBM update dataset contains ${transactions} transactions, while ${this.requiredUpdateTransactions} are required for ${this.runs} runs. Prepare the experiment again with 'jbr prepare -f'.`);
    }
  }

  protected async startTestDriver(
    context: IRunTaskContext,
    args: string[],
    network: string,
  ): Promise<DockerContainerHandler> {
    return await context.docker.containerCreator.start({
      imageName: ExperimentBsbm.DOCKER_IMAGE_BSBM,
      cmdArgs: [
        'testdriver',
        ...args,
      ],
      hostConfig: {
        Binds: [
          `${context.experimentPaths.generated}:/data`,
        ],
        NetworkMode: network,
      },
      logFilePath: Path.join(context.experimentPaths.output, 'logs', 'bsbm-run.txt'),
    });
  }

  public async clean(context: ITaskContext, cleanTargets: ICleanTargets): Promise<void> {
    await this.hookSparqlEndpoint.clean(context, cleanTargets);

    if (cleanTargets.docker) {
      await context.docker.networkCreator.remove(
        context.docker.imageBuilder.getImageName(context, `experiment-bsbm-network`),
      );
    }
  }

  public async waitForEndpoint(context: ITaskContext): Promise<void> {
    await this.httpAvailabilityLatch.sleepUntilAvailable(context, this.endpointUrlExternal);
  }
}

/**
 * The subset of a Docker network inspection result that is used here.
 */
interface IDockerNetworkInfo {
  IPAM: { Config: { Gateway: string }[] };
}
