import type Dockerode from 'dockerode';

/**
 * Allows constraints to be placed on Docker container resources.
 */
export interface DockerResourceConstraints {
  /**
   * Obtain a Docker HostConfig object from the current constraints.
   */
  toHostConfig: () => Dockerode.HostConfig;
}
