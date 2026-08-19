import type Dockerode from 'dockerode';
import type { Logger } from 'winston';
import type { ITaskContext } from '../../lib/task/ITaskContext';

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
      src: [ options.dockerFile, ...options.auxiliaryFiles ?? [] ],
    }, {

      t: options.imageName,
      buildargs: options.buildArgs,
      dockerfile: options.dockerFile,
    });
    const output = await new Promise<IDockerBuildProgress[]>((resolve, reject) => {
      this.dockerode.modem.followProgress(
        buildStream,
        (err: Error | null, res: IDockerBuildProgress[]) => err ? reject(err) : resolve(res),
        (data: IDockerBuildProgress) => {
          if (data.stream?.trim()) {
            options.logger.verbose(data.stream.trim());
          }
        },
      );
    });
    const lastError = output.length > 0 ? output.at(-1)!.error : undefined;
    if (lastError) {
      throw new Error(lastError);
    }
  }

  /**
   * Obtain a proper image name within the current jbr experiment context with the given suffix.
   * @param context A task context.
   * @param suffix A suffix to add to the image name.
   */
  public getImageName(context: ITaskContext, suffix: string): string {
    let pathContext: string = context.experimentName;
    if ('combination' in context.experimentPaths) {
      pathContext = `${pathContext}-combination_${context.experimentPaths.combination}`;
    }
    return `jbr-experiment-${pathContext}-${suffix}`;
  }
}

export interface IDockerImageBuilderArgs {
  cwd: string;
  dockerFile: string;
  auxiliaryFiles?: string[];
  imageName: string;
  buildArgs?: Record<string, string>;
  logger: Logger;
}

/**
 * A progress entry emitted by the Docker build stream.
 */
interface IDockerBuildProgress {
  stream?: string;
  error?: string;
}
