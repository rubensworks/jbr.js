import type { ITaskContext } from '../task/ITaskContext';

export abstract class Hook {
  /**
   * Called when data needs to be prepared for an experiment hook.
   * @param context The task context.
   */
  public abstract prepare(context: ITaskContext): Promise<void>;

  /**
   * Called to start an experiment hook.
   * @param context The task context.
   * @return callback to stop the hook.
   */
  public abstract start(context: ITaskContext): Promise<() => Promise<void>>;
}
