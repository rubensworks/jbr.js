import type { IExperimentPaths } from '../..';
import type { Hook } from './Hook';

/**
 * Handler for a certain type of experiment hook.
 */
export abstract class HookHandler<H extends Hook> {
  /**
   * Unique id of this experiment hook type.
   */
  public readonly id: string;

  /**
   * Name of the experiment hook class.
   * This will be used to initialize config files.
   */
  public readonly hookClassName: string;

  public constructor(id: string, hookClassName: string) {
    this.id = id;
    this.hookClassName = hookClassName;
  }

  /**
   * Default parameters that should be added to the 'jbr-experiment.json' file during initialization.
   * These should correspond to all (required) Components.js parameters for instantiating an experiment.
   * @param experimentPaths The experiment directories. (guaranteed to exists)
   */
  public abstract getDefaultParams(experimentPaths: IExperimentPaths): Record<string, any>;

  /**
   * Called upon initializing a new experiment.
   * @param experimentPaths The experiment directories. (guaranteed to exists)
   * @param hookHandler The experiment hook handler instance.
   */
  public abstract init(experimentPaths: IExperimentPaths, hookHandler: H): Promise<void>;
}
