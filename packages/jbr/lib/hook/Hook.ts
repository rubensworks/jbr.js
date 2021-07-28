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
   * @param options Custom start options.
   * @return A process handler.
   */
  start: (context: ITaskContext, options?: IHookStartOptions) => Promise<ProcessHandler>;
}

export interface IHookStartOptions {
  docker?: { network?: string };
}
