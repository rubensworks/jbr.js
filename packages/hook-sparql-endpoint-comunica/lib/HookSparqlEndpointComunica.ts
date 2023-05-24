import Path from 'path';
import type { ITaskContext, DockerResourceConstraints,
  ProcessHandler, Hook, IHookStartOptions, ICleanTargets } from 'jbr';

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
  }

  public getDockerImageName(context: ITaskContext): string {
    return context.docker.imageBuilder.getImageName(context, `sparql-endpoint-comunica`);
  }

  public async prepare(context: ITaskContext, forceOverwriteGenerated: boolean): Promise<void> {
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
    const additionalMaps = this.additionalBinds.map(x => Path.join(context.experimentPaths.root, x))
    return await context.docker.containerCreator.start({
      containerName: 'comunica',
      imageName: this.getDockerImageName(context),
      resourceConstraints: this.resourceConstraints,
      hostConfig: {
        Binds: [
          `${Path.join(context.experimentPaths.root, this.contextClient)}:/tmp/context.json`,
          ...additionalMaps
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
  }

  public async clean(context: ITaskContext, cleanTargets: ICleanTargets): Promise<void> {
    if (cleanTargets.docker) {
      await context.docker.containerCreator.remove('comunica');
    }
  }
}
