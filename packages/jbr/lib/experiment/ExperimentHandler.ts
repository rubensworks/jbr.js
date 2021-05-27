import type { Experiment } from './Experiment';

/**
 * Handler for a certain type of experiment.
 */
export abstract class ExperimentHandler<E extends Experiment> {
  /**
   * Unique id of this experiment type.
   */
  public readonly id: string;
  /**
   * Name of the experiment class.
   * This will be used to initialize config files.
   */
  public readonly experimentClassName: string;

  public constructor(id: string, experimentClassName: string) {
    this.id = id;
    this.experimentClassName = experimentClassName;
  }

  /**
   * Default parameters that should be added to the 'jbr-experiment.json' file during initialization.
   * These should correspond to all (required) Components.js parameters for instantiating an experiment.
   * @param experimentDirectory The target directory for the experiment. (does not exist yet)
   */
  public abstract getDefaultParams(experimentDirectory: string): Record<string, any>;

  /**
   * Names of possible hooks into the experiment.
   */
  public abstract getHookNames(): string[];

  /**
   * Called upon initializing a new experiment.
   * @param experimentDirectory The target directory for the experiment. (guaranteed to exists)
   * @param experiment The experiment instance.
   */
  public abstract init(experimentDirectory: string, experiment: E): Promise<void>;
}
