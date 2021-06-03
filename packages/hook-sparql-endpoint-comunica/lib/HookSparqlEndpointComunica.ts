import Path from 'path';
import Dockerode from 'dockerode';
import type { ITaskContext, DockerResourceConstraints, ProcessHandler } from 'jbr';
import { Hook, DockerStatsCollector } from 'jbr';
import { DockerContainerCreator } from 'jbr/lib/experiment/docker/DockerContainerCreator';

/**
 * A hook instance for a Comunica-based SPARQL endpoint.
 */
export class HookSparqlEndpointComunica extends Hook {
  public readonly dockerfileClient: string;
  public readonly resourceConstraints: DockerResourceConstraints;
  public readonly configClient: string;
  public readonly clientPort: number;
  public readonly clientLogLevel: string;
  public readonly queryTimeout: number;
  public readonly maxMemory: number;
  public readonly containerCreator: DockerContainerCreator;
  public readonly statsCollector: DockerStatsCollector;

  public constructor(
    dockerfileClient: string,
    resourceConstraints: DockerResourceConstraints,
    configClient: string,
    clientPort: number,
    clientLogLevel: string,
    queryTimeout: number,
    maxMemory: number,
    containerCreator: DockerContainerCreator = new DockerContainerCreator(),
    statsCollector: DockerStatsCollector = new DockerStatsCollector(),
  ) {
    super();
    this.dockerfileClient = dockerfileClient;
    this.resourceConstraints = resourceConstraints;
    this.configClient = configClient;
    this.clientPort = clientPort;
    this.clientLogLevel = clientLogLevel;
    this.queryTimeout = queryTimeout;
    this.maxMemory = maxMemory;
    this.containerCreator = containerCreator;
    this.statsCollector = statsCollector;
  }

  public getDockerImageName(context: ITaskContext): string {
    return `jrb-experiment-${Path.basename(context.cwd)}-sparql-endpoint-comunica`;
  }

  public async prepare(context: ITaskContext): Promise<void> {
    // Build client Dockerfile
    const dockerode = new Dockerode(context.dockerOptions);
    const buildStream = await dockerode.buildImage({
      context: context.cwd,
      src: [ this.dockerfileClient, this.configClient ],
    }, {
      t: this.getDockerImageName(context),
      buildargs: {
        CONFIG_CLIENT: this.configClient,
        QUERY_TIMEOUT: `${this.queryTimeout}`,
        MAX_MEMORY: `${this.maxMemory}`,
        LOG_LEVEL: this.clientLogLevel,
      },
      dockerfile: this.dockerfileClient,
    });
    await new Promise((resolve, reject) => {
      dockerode.modem.followProgress(buildStream, (err: Error, res: any) => err ? reject(err) : resolve(res));
    });
  }

  public async start(context: ITaskContext): Promise<ProcessHandler> {
    // Initialize Docker container
    const containerHandler = await this.containerCreator.start({
      dockerode: new Dockerode(context.dockerOptions),
      imageName: this.getDockerImageName(context),
      resourceConstraints: this.resourceConstraints,
      hostConfig: {
        Binds: [
          `${context.cwd}/input/context-client.json:/tmp/context.json`,
        ],
        PortBindings: {
          '3000/tcp': [
            { HostPort: `${this.clientPort}` },
          ],
        },
      },
      logFilePath: Path.join(context.cwd, 'output', 'logs', 'sparql-endpoint-comunica.txt'),
    });

    // Collect stats
    await this.statsCollector
      .collect(containerHandler, Path.join(context.cwd, 'output', 'stats-sparql-endpoint-comunica.csv'));

    return containerHandler;
  }
}
