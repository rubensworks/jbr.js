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
}
