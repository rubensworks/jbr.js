import type Dockerode from 'dockerode';
import { DockerNetworkHandler } from './DockerNetworkHandler';

/**
 * Conveniently create a Docker network.
 */
export class DockerNetworkCreator {
  private readonly dockerode: Dockerode;

  public constructor(dockerode: Dockerode) {
    this.dockerode = dockerode;
  }

  /**
   * Create a network
   * @param options Network options
   */
  public async create(options: Dockerode.NetworkCreateOptions): Promise<DockerNetworkHandler> {
    return new DockerNetworkHandler(await this.dockerode.createNetwork(options));
  }

  /**
   * Remove a network
   * @param name A network name
   */
  public async remove(name: string): Promise<void> {
    // First prune unused networks
    await this.dockerode.pruneNetworks();

    const network = this.dockerode.getNetwork(name);
    if (network) {
      try {
        await network.remove({ force: true });
      } catch {
        // Ignore errors
      }
    }
  }
}
