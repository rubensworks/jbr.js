import type Dockerode from 'dockerode';

/**
 * Allows constraints to be placed on Docker container resources.
 */
export abstract class DockerResourceConstraints {
  /**
   * Obtain a Docker HostConfig object from the current constraints.
   */
  public abstract toHostConfig(): Dockerode.HostConfig;
}
