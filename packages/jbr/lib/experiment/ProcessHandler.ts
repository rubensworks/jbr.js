/**
 * Handles a started process.
 */
export interface ProcessHandler {
  /**
   * Stop and clean this process.
   */
  close: () => Promise<void>;

  /**
   * Wait until this container is ended.
   */
  join: () => Promise<void>;

  /**
   * Start collecting runtime statistics into the target stats file.
   * The returned callback is used to end stat collection.
   */
  startCollectingStats: () => Promise<() => void>;

  /**
   * Register a termination handler.
   * @param handler A handler that will be invoked when this process terminates.
   */
  addTerminationHandler: (handler: (processName: string, error?: Error) => void) => void;
  /**
   * Remove a termination listener.
   * @param handler A registered handler.
   */
  removeTerminationHandler: (handler: (processName: string, error?: Error) => void) => void;
}
