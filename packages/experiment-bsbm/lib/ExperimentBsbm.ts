import * as Path from 'path';
import * as fs from 'fs-extra';
import { secureProcessHandler, HttpAvailabilityLatch, HdtConverter } from 'jbr';
import type { Experiment, Hook, ICleanTargets, ITaskContext, IRunTaskContext, DockerContainerHandler } from 'jbr';

/**
 * An experiment instance for BSBM.
 */
export class ExperimentBsbm implements Experiment {
  public static readonly DOCKER_IMAGE_BSBM = `vcity/bsbm:v1.0`;
  public readonly httpAvailabilityLatch = new HttpAvailabilityLatch();
  public readonly productCount: number;
  public readonly generateHdt: boolean;
  public readonly hookSparqlEndpoint: Hook;
  public readonly endpointUrlRaw: string;
  public readonly endpointUrlExternal: string;
  public readonly warmupRuns: number;
  public readonly runs: number;

  /**
   * @param productCount
   * @param generateHdt
   * @param hookSparqlEndpoint
   * @param endpointUrl
   * @param endpointUrlExternal
   * @param warmupRuns
   * @param runs
   */
  public constructor(
    productCount: number,
    generateHdt: boolean,
    hookSparqlEndpoint: Hook,
    endpointUrl: string,
    endpointUrlExternal: string,
    warmupRuns: number,
    runs: number,
  ) {
    this.productCount = productCount;
    this.generateHdt = generateHdt;
    this.hookSparqlEndpoint = hookSparqlEndpoint;
    this.endpointUrlRaw = endpointUrl;
    this.endpointUrlExternal = endpointUrlExternal;
    this.warmupRuns = warmupRuns;
    this.runs = runs;
  }

  public async getEndpointUrl(context: ITaskContext): Promise<string> {
    if (process.platform === 'darwin' || process.platform === 'win32') {
      return this.endpointUrlRaw;
    }
    let gatewayIp = '172.17.0.1';
    try {
      const networkInfo = await context.docker.networkInspector.inspect('bridge');
      gatewayIp = networkInfo.IPAM.Config[0].Gateway;
    } catch (error: unknown) {
      context.logger.info(`Error occurred while obtaining gateway IP from Docker bridge: ${(<any> error).message}`);
    }
    return this.endpointUrlRaw.replace('host.docker.internal', gatewayIp);
  }

  public async prepare(context: ITaskContext, forceOverwriteGenerated: boolean): Promise<void> {
    // Prepare hook
    await this.hookSparqlEndpoint.prepare(context, forceOverwriteGenerated);

    // Ensure logs directory exists
    await fs.ensureDir(Path.join(context.experimentPaths.output, 'logs'));

    // Prepare dataset
    context.logger.info(`Generating BSBM dataset`);
    if (!forceOverwriteGenerated && await fs.pathExists(Path.join(context.experimentPaths.generated, 'dataset.nt'))) {
      context.logger.info(`  Skipped`);
    } else {
      await context.docker.imagePuller.pull({ repoTag: ExperimentBsbm.DOCKER_IMAGE_BSBM });
      await (await context.docker.containerCreator.start({
        imageName: ExperimentBsbm.DOCKER_IMAGE_BSBM,
        cmdArgs: [
          'generate',
          '-dir',
          '/data/td_data',
          '-pc', String(this.productCount),
          '-fc',
        ],
        hostConfig: {
          Binds: [
            `${context.experimentPaths.generated}:/data`,
          ],
        },
        logFilePath: Path.join(context.experimentPaths.output, 'logs', 'bsbm-generation.txt'),
      })).join();
    }

    if (this.generateHdt) {
      await new HdtConverter(context, forceOverwriteGenerated, 'bsbm').generate();
    }
  }

  public async run(context: IRunTaskContext): Promise<void> {
    // Create shared network
    const networkHandler = await context.docker.networkCreator.create({
      Name: context.docker.imageBuilder.getImageName(context, `experiment-bsbm-network`),
    });
    const network = networkHandler.network.id;

    // Setup SPARQL endpoint
    const endpointProcessHandler = await this.hookSparqlEndpoint.start(context);
    const endpointProcessHandlerSafe = secureProcessHandler(endpointProcessHandler, context);

    // Wait for the cache proxy to be fully available
    await this.waitForEndpoint(context);

    // Breakpoint right before starting queries.
    if (context.breakpointBarrier) {
      await context.breakpointBarrier();
    }

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
      await this.getEndpointUrl(context),
    ], network);

    // Wait for the experiment driver to end
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
