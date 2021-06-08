import type { ProcessHandler } from '../experiment/ProcessHandler';
import type { ITaskContext } from '../task/ITaskContext';

export interface Hook {
  /**
   * Called when data needs to be prepared for an experiment hook.
   * @param context The task context.
   */
  prepare: (context: ITaskContext) => Promise<void>;

  /**
   * Called to start an experiment hook.
   * @param context The task context.
   * @return A process handler.
   */
  start: (context: ITaskContext) => Promise<ProcessHandler>;
}
