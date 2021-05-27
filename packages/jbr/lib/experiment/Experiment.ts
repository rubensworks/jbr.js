import type { ITaskContext } from '../task/ITaskContext';

export abstract class Experiment {
  /**
   * Called when data needs to be prepared for an experiment.
   * @param context The task context.
   */
  public abstract prepare(context: ITaskContext): Promise<void>;

  /**
   * Called when an experiment is executed.
   * @param context The task context.
   */
  public abstract run(context: ITaskContext): Promise<void>;
}
