import type { DockerOptions } from 'dockerode';
import type { Logger } from 'winston';

/**
 * Common data when running a task.
 */
export interface ITaskContext {
  cwd: string;
  mainModulePath: string;
  verbose: boolean;
  exitProcess: () => void;
  logger: Logger;
  /**
   * This can be used to connect to a different Docker instance.
   * More information on https://github.com/apocas/dockerode#getting-started.
   * If none is provided, any Docker calls will go via the default Docker socket on your system.
   */
  dockerOptions?: DockerOptions;
}
