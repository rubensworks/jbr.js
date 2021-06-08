import type { ITaskContext } from '../task/ITaskContext';

export interface Experiment {
  /**
   * Called when data needs to be prepared for an experiment.
   * @param context The task context.
   */
  prepare: (context: ITaskContext) => Promise<void>;

  /**
   * Called when an experiment is executed.
   * @param context The task context.
   */
  run: (context: ITaskContext) => Promise<void>;
}
