import Path from 'path';
import { ProcessHandlerComposite } from 'jbr';
import type { ITaskContext, DockerResourceConstraints,
  ProcessHandler, Hook, IHookStartOptions, ICleanTargets } from 'jbr';

/**
 * A hook instance for a LDF server-based SPARQL endpoint.
 */
export class HookSparqlEndpointLdf implements Hook {
  public readonly dockerfile: string;
  public readonly dockerfileCache: string;
  public readonly resourceConstraints: DockerResourceConstraints;
  public readonly config: string;
  public readonly portServer: number;
  public readonly portCache: number;
  public readonly workers: number;
  public readonly maxMemory: number;
  public readonly dataset: string;
  public readonly hookSparqlEndpointLdfEngine: Hook;
  public readonly cacheUrl: string;

  public constructor(
    dockerfile: string,
    dockerfileCache: string,
    resourceConstraints: DockerResourceConstraints,
    config: string,
    portServer: number,
    portCache: number,
    workers: number,
    maxMemory: number,
    dataset: string,
    hookSparqlEndpointLdfEngine: Hook,
    cacheUrl?: string,
  ) {
    this.dockerfile = dockerfile;
    this.dockerfileCache = dockerfileCache;
    this.resourceConstraints = resourceConstraints;
    this.config = config;
    this.portServer = portServer;
    this.portCache = portCache;
    this.workers = workers;
    this.maxMemory = maxMemory;
    this.dataset = dataset;
    this.hookSparqlEndpointLdfEngine = hookSparqlEndpointLdfEngine;
    this.cacheUrl = cacheUrl || `http://localhost:${this.portCache}/dataset`;
  }

  public getDockerImageName(context: ITaskContext, type: string): string {
    return context.docker.imageBuilder.getImageName(context, `sparql-endpoint-ldf-${type}`);
  }

  public async prepare(context: ITaskContext, forceOverwriteGenerated: boolean): Promise<void> {
    // Build server Dockerfile
    context.logger.info(`Building LDF server Docker image`);
    await context.docker.imageBuilder.build({
      cwd: context.experimentPaths.root,
      dockerFile: this.dockerfile,
      auxiliaryFiles: [ this.config ],
      imageName: this.getDockerImageName(context, 'server'),
      buildArgs: {
        SERVER_CONFIG: this.config,
        SERVER_WORKERS: `${this.workers}`,
        MAX_MEMORY: `${this.maxMemory}`,
      },
      logger: context.logger,
    });

    // Build cache Dockerfile
    context.logger.info(`Building LDF server cache Docker image`);
    await context.docker.imageBuilder.build({
      cwd: context.experimentPaths.root,
      dockerFile: this.dockerfileCache,
      imageName: this.getDockerImageName(context, 'cache'),
      logger: context.logger,
    });

    // Prepare LDF engine
    context.logger.info(`Preparing LDF engine hook`);
    await this.hookSparqlEndpointLdfEngine.prepare(context, forceOverwriteGenerated);
  }

  public async start(context: ITaskContext, options?: IHookStartOptions): Promise<ProcessHandler> {
    // Create shared network
    const networkHandler = options?.docker?.network ?
      undefined :
      await context.docker.networkCreator.create({ Name: this.getDockerImageName(context, 'network') });
    const network = options?.docker?.network || networkHandler!.network.id;

    // Determine dataset path
    let datasetPath = this.dataset;
    if (datasetPath.startsWith('generated/')) {
      datasetPath = Path.join(context.experimentPaths.generated, datasetPath.slice(10));
    } else {
      datasetPath = Path.join(context.experimentPaths.root, this.dataset);
    }

    // Start LDF server
    const serverHandler = await context.docker.containerCreator.start({
      containerName: 'ldfserver',
      imageName: this.getDockerImageName(context, 'server'),
      resourceConstraints: this.resourceConstraints,
      hostConfig: {
        Binds: [
          `${datasetPath}:/data/dataset.hdt`,
          `${datasetPath}.index.v1-1:/data/dataset.hdt.index.v1-1`,
        ],
        PortBindings: {
          '3000/tcp': [
            { HostPort: `${this.portServer}` },
          ],
        },
        NetworkMode: network,
      },
      logFilePath: Path.join(context.experimentPaths.output, 'logs', 'sparql-endpoint-ldf-server.txt'),
      statsFilePath: Path.join(context.experimentPaths.output, 'stats-sparql-endpoint-ldf-server.csv'),
    });

    // Start cache proxy
    const cacheHandler = await context.docker.containerCreator.start({
      containerName: 'cache',
      imageName: this.getDockerImageName(context, 'cache'),
      resourceConstraints: this.resourceConstraints,
      hostConfig: {
        Binds: [
          // Ideally, we do this at build time, but impossible due to https://github.com/apocas/dockerode/issues/553
          `${Path.join(context.experimentPaths.input, 'nginx-default')}:/etc/nginx/sites-enabled/default`,
          `${Path.join(context.experimentPaths.input, 'nginx.conf')}:/etc/nginx/nginx.conf`,
        ],
        PortBindings: {
          '80/tcp': [
            { HostPort: `${this.portCache}` },
          ],
        },
        NetworkMode: network,
      },
      logFilePath: Path.join(context.experimentPaths.output, 'logs', 'sparql-endpoint-ldf-cache.txt'),
      statsFilePath: Path.join(context.experimentPaths.output, 'stats-sparql-endpoint-ldf-cache.csv'),
    });

    // Wait for the cache proxy to be fully available
    await this.waitForEndpoint(context, this.cacheUrl);

    // Start LDF engine
    const ldfEngineHandler = await this.hookSparqlEndpointLdfEngine.start(context, { docker: { network }});

    return new ProcessHandlerComposite([
      ldfEngineHandler,
      cacheHandler,
      serverHandler,
      ...networkHandler ? [ networkHandler ] : [],
    ]);
  }

  public async clean(context: ITaskContext, cleanTargets: ICleanTargets): Promise<void> {
    await this.hookSparqlEndpointLdfEngine.clean(context, cleanTargets);

    if (cleanTargets.docker) {
      await context.docker.networkCreator.remove(this.getDockerImageName(context, 'network'));
      await context.docker.containerCreator.remove('ldfserver');
      await context.docker.containerCreator.remove('cache');
    }
  }

  /**
   * Based on a hrtime start, obtain the duration.
   * @param hrstart process.hrtime
   */
  public countTime(hrstart: [number, number]): number {
    const hrend = process.hrtime(hrstart);
    return hrend[0] * 1_000 + hrend[1] / 1_000_000;
  }

  /**
   * Sleep for a given amount of time.
   * @param durationMs A duration in milliseconds.
   */
  public async sleep(durationMs: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, durationMs));
  }

  /**
   * Check if the server is available.
   */
  public async endpointAvailable(url: string): Promise<boolean> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    const promiseTimeout = new Promise<boolean>(resolve => {
      timeoutHandle = setTimeout(() => resolve(false), 1_000);
    });
    const promiseFetch = new Promise<boolean>(resolve => {
      fetch(url, {
        method: 'HEAD',
      }).then(respose => resolve(respose.ok)).catch(() => resolve(false));
    });
    const available = await Promise.race([ promiseTimeout, promiseFetch ]);
    clearTimeout(timeoutHandle);
    return available;
  }

  /**
   * Wait until the server is available.
   */
  public async waitForEndpoint(context: ITaskContext, url: string): Promise<void> {
    const hrstart = process.hrtime();
    const elapsed = (): number => Math.round(this.countTime(hrstart) / 1_000);
    while (!await this.endpointAvailable(url)) {
      await this.sleep(1_000);
      context.logger.info(`Cache proxy at ${url} not available yet, waited for ${elapsed()} seconds...`);
    }
    context.logger.info(`Cache proxy at ${url} available after ${elapsed()} seconds`);
  }
}
