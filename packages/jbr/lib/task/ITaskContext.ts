import type { Logger } from 'winston';
import type { DockerContainerCreator } from '../docker/DockerContainerCreator';
import type { DockerImageBuilder } from '../docker/DockerImageBuilder';
import type { DockerImagePuller } from '../docker/DockerImagePuller';
import type { DockerNetworkCreator } from '../docker/DockerNetworkCreator';
import type { DockerNetworkInspector } from '../docker/DockerNetworkInspector';

/**
 * Common data when running a task.
 */
export interface ITaskContext {
  cwd: string;
  experimentPaths: IExperimentPaths;
  experimentName: string;
  mainModulePath: string;
  verbose: boolean;
  logger: Logger;
  docker: {
    containerCreator: DockerContainerCreator;
    imageBuilder: DockerImageBuilder;
    imagePuller: DockerImagePuller;
    networkCreator: DockerNetworkCreator;
    networkInspector: DockerNetworkInspector;
  };
  /**
   * Function that will cleanly close the experiment.
   * This may be used in case an error occurs that requires the experiment to be closed earlier.
   */
  closeExperiment: () => void;
  /**
   * Listeners can be appended to this array
   * to make sure that they are invoked when the process ends abnormally.
   */
  cleanupHandlers: (() => Promise<void>)[];
  /**
   * An optional barrier that -when defined-
   * must cause experiments to await its resolution.
   *
   * This can be used as break-points when debugging experiments.
   */
  breakpointBarrier?: () => Promise<void>;
}

/**
 * Relevant paths for an experiment.
 */
export interface IExperimentPaths {
  root: string;
  input: string;
  generated: string;
  output: string;
  combination?: number;
}
