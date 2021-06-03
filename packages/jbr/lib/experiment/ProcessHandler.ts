/**
 * Handles a started process.
 */
export abstract class ProcessHandler {
  /**
   * Stop and clean this process.
   */
  public abstract close(): Promise<void>;

  /**
   * Start collecting runtime statistics into the target stats file.
   * The returned callback is used to end stat collection.
   */
  public abstract startCollectingStats(): Promise<() => void>;
}
