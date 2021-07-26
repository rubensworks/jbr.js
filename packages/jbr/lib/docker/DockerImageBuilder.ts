import type Dockerode from 'dockerode';

/**
 * Conveniently build a Docker image.
 */
export class DockerImageBuilder {
  private readonly dockerode: Dockerode;

  public constructor(dockerode: Dockerode) {
    this.dockerode = dockerode;
  }

  /**
   * Build an image
   * @param options Image options
   */
  public async build(options: IDockerImageBuilderArgs): Promise<void> {
    const buildStream = await this.dockerode.buildImage({
      context: options.cwd,
      src: [ options.dockerFile, ...options.auxiliaryFiles || [] ],
    }, {
      t: options.imageName,
      buildargs: options.buildArgs,
      dockerfile: options.dockerFile,
    });
    const output: any[] = await new Promise((resolve, reject) => {
      this.dockerode.modem.followProgress(buildStream, (err: Error, res: any) => err ? reject(err) : resolve(res));
    });
    if (output.length > 0 && output[output.length - 1].error) {
      throw new Error(output[output.length - 1].error);
    }
  }
}

export interface IDockerImageBuilderArgs {
  cwd: string;
  dockerFile: string;
  auxiliaryFiles?: string[];
  imageName: string;
  buildArgs?: Record<string, string>;
}
