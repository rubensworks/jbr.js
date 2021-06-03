import type { Logger } from 'winston';
import type { DockerStatsCollector } from '../..';
import type { DockerContainerCreator } from '../experiment/docker/DockerContainerCreator';
import type { DockerImageBuilder } from '../experiment/docker/DockerImageBuilder';

/**
 * Common data when running a task.
 */
export interface ITaskContext {
  cwd: string;
  mainModulePath: string;
  verbose: boolean;
  exitProcess: () => void;
  logger: Logger;
  docker: {
    containerCreator: DockerContainerCreator;
    imageBuilder: DockerImageBuilder;
    statsCollector: DockerStatsCollector;
  };
}
