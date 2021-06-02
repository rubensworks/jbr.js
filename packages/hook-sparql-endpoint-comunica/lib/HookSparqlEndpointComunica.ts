import Path from 'path';
import Dockerode from 'dockerode';
import * as fs from 'fs-extra';
import type { ITaskContext, DockerResourceConstraints } from 'jbr';
import { Hook } from 'jbr';

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

  public constructor(
    dockerfileClient: string,
    resourceConstraints: DockerResourceConstraints,
    configClient: string,
    clientPort: number,
    clientLogLevel: string,
    queryTimeout: number,
    maxMemory: number,
  ) {
    super();
    this.dockerfileClient = dockerfileClient;
    this.resourceConstraints = resourceConstraints;
    this.configClient = configClient;
    this.clientPort = clientPort;
    this.clientLogLevel = clientLogLevel;
    this.queryTimeout = queryTimeout;
    this.maxMemory = maxMemory;
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

  public async start(context: ITaskContext): Promise<() => Promise<void>> {
    // Initialize Docker container
    const dockerode = new Dockerode(context.dockerOptions);
    const container = await dockerode.createContainer({
      Image: this.getDockerImageName(context),
      Tty: true,
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: {
        Binds: [
          `${context.cwd}/input/context-client.json:/tmp/context.json`,
        ],
        PortBindings: {
          '3000/tcp': [
            { HostPort: `${this.clientPort}` },
          ],
        },
        ...this.resourceConstraints.toHostConfig(),
      },
    });

    // Write output to logs
    const out = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });
    // eslint-disable-next-line import/namespace
    out.pipe(fs.createWriteStream(Path.join(context.cwd, 'output', 'logs', 'sparql-endpoint-comunica.txt'), 'utf8'));

    // Start container
    await container.start();

    return async() => {
      await container.kill();
      await container.remove();
    };
  }
}
