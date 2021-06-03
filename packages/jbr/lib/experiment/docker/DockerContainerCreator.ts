import type Dockerode from 'dockerode';
import * as fs from 'fs-extra';
import { DockerContainerHandler } from './DockerContainerHandler';
import type { DockerResourceConstraints } from './DockerResourceConstraints';

/**
 * Conveniently create a Docker container.
 */
export class DockerContainerCreator {
  /**
   * Start the configured container.
   */
  public async start(options: IDockerContainerHandlerArgs): Promise<DockerContainerHandler> {
    // Initialize Docker container
    const container = await options.dockerode.createContainer({
      Image: options.imageName,
      Tty: true,
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: {
        ...options.hostConfig,
        ...options.resourceConstraints.toHostConfig(),
      },
    });

    // Write output to logs
    const out = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });
    // eslint-disable-next-line import/namespace
    out.pipe(fs.createWriteStream(options.logFilePath, 'utf8'));

    // Start container
    await container.start();

    return new DockerContainerHandler(container);
  }
}

export interface IDockerContainerHandlerArgs {
  dockerode: Dockerode;
  imageName: string;
  resourceConstraints: DockerResourceConstraints;
  hostConfig: Dockerode.HostConfig;
  logFilePath: string;
}
