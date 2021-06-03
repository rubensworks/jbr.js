import type Dockerode from 'dockerode';
import { ProcessHandler } from '../ProcessHandler';

/**
 * Docker container wrapped in a convenience datastructure.
 */
export class DockerContainerHandler extends ProcessHandler {
  public readonly container: Dockerode.Container;

  public constructor(container: Dockerode.Container) {
    super();
    this.container = container;
  }

  /**
   * Stop and clean this container
   */
  public async close(): Promise<void> {
    await this.container.kill();
    await this.container.remove();
  }
}
