import type { Logger } from 'winston';
import type { DockerContainerCreator } from '../docker/DockerContainerCreator';
import type { DockerImageBuilder } from '../docker/DockerImageBuilder';
import type { DockerImagePuller } from '../docker/DockerImagePuller';

/**
 * Common data when running a task.
 */
export interface ITaskContext {
  cwd: string;
  experimentPaths: IExperimentPaths;
  mainModulePath: string;
  verbose: boolean;
  logger: Logger;
  docker: {
    containerCreator: DockerContainerCreator;
    imageBuilder: DockerImageBuilder;
    imagePuller: DockerImagePuller;
  };
  /**
   * Listeners can be appended to this array
   * to make sure that they are invoked when the process ends abnormally.
   */
  cleanupHandlers: (() => Promise<void>)[];
}

/**
 * Relevant paths for an experiment.
 */
export interface IExperimentPaths {
  root: string;
  input: string;
  generated: string;
  output: string;
}
