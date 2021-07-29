import type Dockerode from 'dockerode';

/**
 * Conveniently pull a Docker image.
 */
export class DockerImagePuller {
  private readonly dockerode: Dockerode;

  public constructor(dockerode: Dockerode) {
    this.dockerode = dockerode;
  }

  /**
   * Pull an image
   * @param options Image options
   */
  public async pull(options: IDockerImagePullerArgs): Promise<void> {
    const buildStream = await this.dockerode.pull(options.repoTag);
    await new Promise((resolve, reject) => {
      this.dockerode.modem.followProgress(buildStream,
        (err: Error | null, res: any[]) => err ? reject(err) : resolve(res));
    });
  }
}

export interface IDockerImagePullerArgs {
  repoTag: string;
}
