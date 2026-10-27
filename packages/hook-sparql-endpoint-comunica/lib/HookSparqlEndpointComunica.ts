import * as http from 'node:http';
import Path from 'node:path';
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

/**
 * A hook instance for a Comunica-based SPARQL endpoint.
 */
export class HookSparqlEndpointComunica implements Hook {
  public readonly dockerfileClient: string;
  public readonly resourceConstraints: DockerResourceConstraints;
  public readonly configClient: string;
  public readonly contextClient: string;
  public readonly additionalBinds: string[];
  public readonly clientPort: number;
  public readonly clientLogLevel: string;
  public readonly queryTimeout: number;
  public readonly maxMemory: number;
  public readonly preloadQuery: string | undefined;
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
   * @param preloadQuery An optional query that is executed once after starting the endpoint,
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
    preloadQuery?: string,
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
        await this.preload(context, this.preloadQuery);
      } catch (error: unknown) {
        await processHandler.close();
        throw error;
      }
    }

    return processHandler;
  }

  /**
   * Execute the given query once, and record how long it took.
   * @param context The task context.
   * @param query The query to execute.
   */
  protected async preload(context: ITaskContext, query: string): Promise<void> {
    const url = `http://localhost:${this.clientPort}/sparql`;
    await this.httpAvailabilityLatch.sleepUntilAvailable(context, url);

    context.logger.info(`Preloading SPARQL endpoint with query: ${query}`);
    const startTime = performance.now();
    await this.httpGet(`${url}?query=${encodeURIComponent(query)}`);
    const time = Math.round(performance.now() - startTime);
    context.logger.info(`Preloaded SPARQL endpoint in ${time}ms`);

    await fs.writeFile(Path.join(context.experimentPaths.output, 'logs', 'sparql-endpoint-comunica-preload-time.csv'), `time\n${time}`, 'utf-8');
  }

  /**
   * Send a GET request and consume the response, without any client-side timeout.
   * @param url The URL to request.
   */
  protected httpGet(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      http.get(url, (response) => {
        response.resume();
        response.on('end', () => {
          if (response.statusCode! >= 200 && response.statusCode! < 300) {
            resolve();
          } else {
            reject(new Error(`Preload query failed with status code ${response.statusCode} on ${url}`));
          }
        });
        response.on('error', reject);
      }).on('error', reject);
    });
  }

  public async clean(context: ITaskContext, cleanTargets: ICleanTargets): Promise<void> {
    if (cleanTargets.docker) {
      await context.docker.containerCreator.remove('comunica');
    }
  }
}
