import Path from 'path';
import type {
  ITaskContext,
  ProcessHandler,
  Hook,
  IHookStartOptions,
  ICleanTargets,
  DockerResourceConstraints,
} from 'jbr';

/**
 * A hook instance for a Docker-based hook.
 */
export class HookDocker implements Hook {
  public readonly dockerfile: string;
  public readonly resourceConstraints: DockerResourceConstraints;
  public readonly additionalBinds: string[];
  public readonly additionalFilesPrepare: string[];
  public readonly innerPort: number;
  public readonly outerPort: number;

  public constructor(
    dockerfile: string,
    resourceConstraints: DockerResourceConstraints,
    additionalBinds: string[],
    additionalFilesPrepare: string[],
    innerPort: number,
    outerPort: number,
  ) {
    this.dockerfile = dockerfile;
    this.resourceConstraints = resourceConstraints;
    this.additionalBinds = additionalBinds;
    this.additionalFilesPrepare = additionalFilesPrepare;
    this.innerPort = innerPort;
    this.outerPort = outerPort;
  }

  public getDockerImageName(context: ITaskContext): string {
    return context.docker.imageBuilder.getImageName(context, `hook-docker`);
  }

  public async prepare(context: ITaskContext, forceOverwriteGenerated: boolean): Promise<void> {
    // Build client Dockerfile
    await context.docker.imageBuilder.build({
      cwd: context.experimentPaths.root,
      dockerFile: this.dockerfile,
      imageName: this.getDockerImageName(context),
      logger: context.logger,
      auxiliaryFiles: this.additionalFilesPrepare,
    });
  }

  public async start(context: ITaskContext, options?: IHookStartOptions): Promise<ProcessHandler> {
    const additionalMaps = this.additionalBinds.map(x => Path.join(context.experimentPaths.root, x));
    return await context.docker.containerCreator.start({
      containerName: 'hook-docker',
      imageName: this.getDockerImageName(context),
      resourceConstraints: this.resourceConstraints,
      hostConfig: {
        Binds: additionalMaps,
        PortBindings: {
          [`${this.innerPort}/tcp`]: [
            { HostPort: `${this.outerPort}` },
          ],
        },
        NetworkMode: options?.docker?.network,
      },
      logFilePath: Path.join(context.experimentPaths.output, 'logs', 'hook-docker.txt'),
      statsFilePath: Path.join(context.experimentPaths.output, 'stats-hook-docker.csv'),
    });
  }

  public async clean(context: ITaskContext, cleanTargets: ICleanTargets): Promise<void> {
    if (cleanTargets.docker) {
      await context.docker.containerCreator.remove('hook-docker');
    }
  }
}
