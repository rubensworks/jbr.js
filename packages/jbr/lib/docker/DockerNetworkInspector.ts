import type Dockerode from 'dockerode';

/**
 * Conveniently inspect a Docker network.
 */
export class DockerNetworkInspector {
  private readonly dockerode: Dockerode;

  public constructor(dockerode: Dockerode) {
    this.dockerode = dockerode;
  }

  /**
   * Inspect a network
   * @param id Network id
   */
  public inspect(id: string): Promise<any> {
    return this.dockerode.getNetwork(id).inspect();
  }
}
