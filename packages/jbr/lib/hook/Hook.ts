import type { ProcessHandler } from '../experiment/ProcessHandler';
import type { ICleanTargets } from '../task/ICleanTargets';
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
   * @param options Custom start options.
   * @return A process handler.
   */
  start: (context: ITaskContext, options?: IHookStartOptions) => Promise<ProcessHandler>;

  /**
   * Called when a hook needs to be cleaned up.
   * @param context The task context.
   * @param cleanTargets What parts of the experiment that need cleaning.
   */
  clean: (context: ITaskContext, cleanTargets: ICleanTargets) => Promise<void>;
}

export interface IHookStartOptions {
  docker?: { network?: string };
}
