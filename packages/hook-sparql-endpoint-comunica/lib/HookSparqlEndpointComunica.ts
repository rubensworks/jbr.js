import Path from 'node:path';
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import * as fs from 'fs-extra';
import { HttpAvailabilityLatch } from 'jbr';
import type {
  ITaskContext,
  DockerResourceConstraints,
  ProcessHandler,
  Hook,
  IHookStartOptions,
  ICleanTargets,
} from 'jbr';
import { Agent, fetch } from 'undici';
import type { RequestInfo as UndiciRequestInfo, RequestInit as UndiciRequestInit } from 'undici';

/**
 * A hook instance for a Comunica-based SPARQL endpoint.
 */
export class HookSparqlEndpointComunica implements Hook {
  public static readonly PRELOAD_QUERY = 'ASK { ?s ?p ?o }';
  public readonly dockerfileClient: string;
  public readonly resourceConstraints: DockerResourceConstraints;
  public readonly configClient: string;
  public readonly contextClient: string;
  public readonly additionalBinds: string[];
  public readonly clientPort: number;
  public readonly clientLogLevel: string;
  public readonly queryTimeout: number;
  public readonly maxMemory: number;
  public readonly preloadQuery: boolean | undefined;
  public readonly httpAvailabilityLatch = new HttpAvailabilityLatch();

  /**
   * @param dockerfileClient Path to the Dockerfile of Comunica.
   * @param resourceConstraints Resource constraints for the Docker container.
   * @param configClient Path to the configuration file of a Comunica engine.
   * @param contextClient Path to the context file of a Comunica engine.
   * @param additionalBinds The local file bindings to the client Docker container.
   * @param clientPort HTTP port on which the SPARQL endpoint will be exposed.
   * @param clientLogLevel Logging level for the Comunica engine.
   * @param queryTimeout Timeout in seconds for a single SPARQL query execution.
   * @param maxMemory Maximum amount of memory for the Comunica Node.js process in MB.
   * @param preloadQuery If an ASK query will be sent to the endpoint for kickstarting it,
   *                     before the hook is considered started.
   *                     This forces sources to be loaded, as Comunica only loads them upon the first query.
   */
  public constructor(
    dockerfileClient: string,
    resourceConstraints: DockerResourceConstraints,
    configClient: string,
    contextClient: string,
    additionalBinds: string[],
    clientPort: number,
    clientLogLevel: string,
    queryTimeout: number,
    maxMemory: number,
    preloadQuery?: boolean,
  ) {
    this.dockerfileClient = dockerfileClient;
    this.resourceConstraints = resourceConstraints;
    this.configClient = configClient;
    this.contextClient = contextClient;
    this.additionalBinds = additionalBinds;
    this.clientPort = clientPort;
    this.clientLogLevel = clientLogLevel;
    this.queryTimeout = queryTimeout;
    this.maxMemory = maxMemory;
    this.preloadQuery = preloadQuery;
  }

  public getDockerImageName(context: ITaskContext): string {
    return context.docker.imageBuilder.getImageName(context, `sparql-endpoint-comunica`);
  }

  public async prepare(context: ITaskContext, _forceOverwriteGenerated: boolean): Promise<void> {
    // Build client Dockerfile
    await context.docker.imageBuilder.build({
      cwd: context.experimentPaths.root,
      dockerFile: this.dockerfileClient,
      auxiliaryFiles: [ this.configClient ],
      imageName: this.getDockerImageName(context),
      buildArgs: {
        CONFIG_CLIENT: this.configClient,
        QUERY_TIMEOUT: `${this.queryTimeout}`,
        MAX_MEMORY: `${this.maxMemory}`,
        LOG_LEVEL: this.clientLogLevel,
      },
      logger: context.logger,
    });
  }

  public async start(context: ITaskContext, options?: IHookStartOptions): Promise<ProcessHandler> {
    const additionalMaps = this.additionalBinds.map(x => Path.join(context.experimentPaths.root, x));
    const processHandler = await context.docker.containerCreator.start({
      containerName: 'comunica',
      imageName: this.getDockerImageName(context),
      resourceConstraints: this.resourceConstraints,
      hostConfig: {
        Binds: [
          `${Path.join(context.experimentPaths.root, this.contextClient)}:/tmp/context.json`,
          ...additionalMaps,
        ],
        PortBindings: {
          '3000/tcp': [
            { HostPort: `${this.clientPort}` },
          ],
        },
        NetworkMode: options?.docker?.network,
      },
      logFilePath: Path.join(context.experimentPaths.output, 'logs', 'sparql-endpoint-comunica.txt'),
      statsFilePath: Path.join(context.experimentPaths.output, 'stats-sparql-endpoint-comunica.csv'),
    });

    if (this.preloadQuery) {
      try {
        await this.preload(context);
      } catch (error: unknown) {
        await processHandler.close();
        throw error;
      }
    }

    return processHandler;
  }

  /**
   * Execute an ASK query once, and record how long it took.
   * @param context The task context.
   */
  protected async preload(context: ITaskContext): Promise<void> {
    const url = `http://localhost:${this.clientPort}/sparql`;
    await this.httpAvailabilityLatch.sleepUntilAvailable(context, url);

    // Comunica only sends response headers once its sources are loaded, which can exceed fetch's default timeouts.
    const dispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
    const fetcher = new SparqlEndpointFetcher({
      method: 'GET',
      fetch: async(input, init) => <Response> <unknown> await fetch(
        <UndiciRequestInfo> <unknown> input,
        { ...<UndiciRequestInit> <unknown> init, dispatcher },
      ),
    });

    context.logger.info(`Preloading SPARQL endpoint with query: ${HookSparqlEndpointComunica.PRELOAD_QUERY}`);
    const startTime = performance.now();
    try {
      await fetcher.fetchAsk(url, HookSparqlEndpointComunica.PRELOAD_QUERY);
    } finally {
      await dispatcher.close();
    }
    const time = Math.round(performance.now() - startTime);
    context.logger.info(`Preloaded SPARQL endpoint in ${time}ms`);

    await fs.writeFile(Path.join(context.experimentPaths.output, 'logs', 'sparql-endpoint-comunica-preload-time.csv'), `time\n${time}`, 'utf-8');
  }

  public async clean(context: ITaskContext, cleanTargets: ICleanTargets): Promise<void> {
    if (cleanTargets.docker) {
      await context.docker.containerCreator.remove('comunica');
    }
  }
}
