import type { Logger } from 'winston';
import type { DockerContainerCreator } from '../docker/DockerContainerCreator';
import type { DockerImageBuilder } from '../docker/DockerImageBuilder';

/**
 * Common data when running a task.
 */
export interface ITaskContext {
  cwd: string;
  mainModulePath: string;
  verbose: boolean;
  logger: Logger;
  docker: {
    containerCreator: DockerContainerCreator;
    imageBuilder: DockerImageBuilder;
  };
  /**
   * Listeners can be appended to this array
   * to make sure that they are invoked when the process ends abnormally.
   */
  cleanupHandlers: (() => Promise<void>)[];
}
