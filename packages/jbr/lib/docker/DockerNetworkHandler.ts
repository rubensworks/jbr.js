import type Dockerode from 'dockerode';
import type { ProcessHandler } from '../experiment/ProcessHandler';

/**
 * Process handler for Docker networks
 */
export class DockerNetworkHandler implements ProcessHandler {
  public readonly network: Dockerode.Network;

  public constructor(network: Dockerode.Network) {
    this.network = network;
  }

  public async close(): Promise<void> {
    await this.network.remove({ force: true });
  }

  public async join(): Promise<void> {
    // Do nothing
  }

  public async startCollectingStats(): Promise<() => void> {
    return () => {
      // Do nothing
    };
  }
}
