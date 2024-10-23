import Path from 'path';
import * as fs from 'fs-extra';
import type { IExperimentPaths } from 'jbr';
import { HookHandler } from 'jbr';
import { HookDocker } from './HookDocker';

/**
 * Hook handler for a Docker command.
 */
export class HookHandlerDocker extends HookHandler<HookDocker> {
  public constructor() {
    super('docker', HookDocker.name);
  }

  public getDefaultParams(experimentPaths: IExperimentPaths): Record<string, any> {
    return {
      dockerfile: 'input/dockerfiles/Dockerfile',
      resourceConstraints: {
        '@type': 'StaticDockerResourceConstraints',
        cpu_percentage: 100,
      },
      additionalBinds: [],
      additionalBindsPrepare: [],
      innerPort: 3000,
      outerPort: 3000,
    };
  }

  public getSubHookNames(): string[] {
    return [];
  }

  public async init(experimentPaths: IExperimentPaths, hookHandler: HookDocker): Promise<void> {
    // Create Dockerfile
    if (!await fs.pathExists(Path.join(experimentPaths.input, 'dockerfiles'))) {
      await fs.mkdir(Path.join(experimentPaths.input, 'dockerfiles'));
    }
    await fs.copyFile(Path.join(__dirname, 'templates', 'dockerfiles', 'Dockerfile'),
      Path.join(experimentPaths.input, 'dockerfiles', 'Dockerfile'));
  }
}
