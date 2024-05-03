import type { ICleanTargets } from '../task/ICleanTargets';
import type { ITaskContext } from '../task/ITaskContext';

export interface Experiment {
  /**
   * Called when data needs to be prepared for an experiment.
   * @param context The task context.
   * @param forceOverwriteGenerated If the generated directory should be overridden.
   */
  prepare: (context: ITaskContext, forceOverwriteGenerated: boolean) => Promise<void>;

  /**
   * Called when an experiment is executed.
   * @param context The task context.
   */
  run: (context: IRunTaskContext) => Promise<void>;

  /**
   * Called when an experiment needs to be cleaned up.
   * @param context The task context.
   * @param cleanTargets What parts of the experiment that need cleaning.
   */
  clean: (context: ITaskContext, cleanTargets: ICleanTargets) => Promise<void>;
}

export type IRunTaskContext = ITaskContext & { filter?: string };
